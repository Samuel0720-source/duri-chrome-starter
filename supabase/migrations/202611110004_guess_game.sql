-- P3: "상대 선택 맞히기" (guess your partner's choice). Three rounds; each player submits
-- their own choice and a guess of the partner's. Answers live in the private schema, so no
-- table API can read them. guess_state() shows a partner's answer for a round only after
-- both have answered it, and the realtime signal carries no answers at all.
begin;

create table public.guess_games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  questions smallint[] not null check (array_length(questions, 1) = 3),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index guess_games_one_open on public.guess_games(room_id) where finished_at is null;
create index on public.guess_games(room_id, created_at desc);
alter table public.guess_games enable row level security;
revoke all on public.guess_games from public, anon, authenticated;
grant select on public.guess_games to authenticated;
create policy room_members_read_games on public.guess_games
  for select to authenticated using (duri_private.is_member(room_id));

create table duri_private.guess_answers (
  game_id uuid not null references public.guess_games(id) on delete cascade,
  round smallint not null check (round between 1 and 3),
  player uuid not null references auth.users(id) on delete cascade,
  own_choice smallint not null check (own_choice between 0 and 3),
  guess_choice smallint not null check (guess_choice between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (game_id, round, player)
);
revoke all on duri_private.guess_answers from public, anon, authenticated;

-- The question bank lives in src/core/guess.ts and has exactly 12 questions of 4 options.
create function public.start_guess_game(target uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare gid uuid; picks smallint[];
begin
  perform 1 from public.couple_rooms where id=target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  if (select count(*) from public.couple_members where room_id=target) < 2 then raise exception 'Partner needed'; end if;
  select id into gid from public.guess_games where room_id=target and finished_at is null;
  if found then return gid; end if;
  select array_agg(q) into picks from (select q::smallint from generate_series(0, 11) q order by random() limit 3) s;
  insert into public.guess_games(room_id, questions) values(target, picks) returning id into gid;
  return gid;
end; $$;

create function public.answer_guess(game uuid, round_no smallint, own smallint, guess smallint) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); rid uuid; prior duri_private.guess_answers;
begin
  if round_no not between 1 and 3 or own not between 0 and 3 or guess not between 0 and 3 then raise exception 'Invalid answer'; end if;
  select g.room_id into rid from public.guess_games g join public.couple_rooms r on r.id=g.room_id
    where g.id=game and g.finished_at is null and r.closed_at is null and duri_private.is_member(g.room_id)
    for update of g;
  if not found then raise exception 'Game unavailable'; end if;
  select * into prior from duri_private.guess_answers where game_id=game and round=round_no and player=actor;
  if found then
    -- A resent identical answer is fine; changing an answer is not.
    if prior.own_choice=own and prior.guess_choice=guess then return; end if;
    raise exception 'Already answered';
  end if;
  insert into duri_private.guess_answers(game_id, round, player, own_choice, guess_choice) values(game, round_no, actor, own, guess);
  if (select count(*) from duri_private.guess_answers where game_id=game) = 6 then
    update public.guess_games set finished_at=clock_timestamp() where id=game;
  end if;
  perform realtime.send(jsonb_build_object('change', 'answer'), 'guess', 'room:' || rid::text, true);
end; $$;

-- What the caller may see of the room's latest game.
create function public.guess_state(target uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := auth.uid(); partner uuid; g public.guess_games; rounds jsonb := '[]'::jsonb;
  mine duri_private.guess_answers; theirs duri_private.guess_answers; my_score int := 0; their_score int := 0; r int;
begin
  if not duri_private.is_member(target) then raise exception 'Room unavailable'; end if;
  select user_id into partner from public.couple_members where room_id=target and user_id<>actor;
  select * into g from public.guess_games where room_id=target order by created_at desc limit 1;
  if not found then return jsonb_build_object('game', null); end if;
  for r in 1..3 loop
    select * into mine from duri_private.guess_answers where game_id=g.id and round=r and player=actor;
    select * into theirs from duri_private.guess_answers where game_id=g.id and round=r and player=partner;
    if mine.player is not null and theirs.player is not null then
      my_score := my_score + (mine.guess_choice = theirs.own_choice)::int;
      their_score := their_score + (theirs.guess_choice = mine.own_choice)::int;
    end if;
    rounds := rounds || jsonb_build_object(
      'round', r,
      'question', g.questions[r],
      'mine', case when mine.player is null then null else jsonb_build_object('own', mine.own_choice, 'guess', mine.guess_choice) end,
      'partnerAnswered', theirs.player is not null,
      -- The partner's choices appear only once both have answered this round.
      'partner', case when mine.player is null or theirs.player is null then null
                      else jsonb_build_object('own', theirs.own_choice, 'guess', theirs.guess_choice) end
    );
  end loop;
  return jsonb_build_object('game', g.id, 'finished', g.finished_at is not null, 'rounds', rounds,
    'score', jsonb_build_object('me', my_score, 'partner', their_score));
end; $$;

revoke all on function public.start_guess_game(uuid), public.answer_guess(uuid,smallint,smallint,smallint),
  public.guess_state(uuid) from public, anon, authenticated;
grant execute on function public.start_guess_game(uuid), public.answer_guess(uuid,smallint,smallint,smallint),
  public.guess_state(uuid) to authenticated;

create trigger guess_games_notify
  after insert on public.guess_games
  for each row execute function duri_private.broadcast_room_event('guess');

commit;
