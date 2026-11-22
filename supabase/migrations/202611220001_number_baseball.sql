-- P9-2: 숫자야구 (number baseball) for the two of them.
--  * Each partner picks a secret of 3 different digits (0-9). Secrets live in the private schema and only
--    the owner's own secret leaves it, until the game is over.
--  * Turns alternate; each guess is scored on the server: S = right digit, right place; B = right digit,
--    wrong place; neither = OUT.
--  * Fair finish: when the starter hits 3S, the other partner still gets one last guess (same number of
--    turns). Both solved = draw. At most 20 guesses each; if both run out, it is a draw.
--  * Every move carries the revision the screen saw, so a double tap or a stale screen changes nothing.
--  * New games go through the shared request/accept flow (kind 'baseball'); the starter alternates.
begin;

create table duri_private.baseball_games (
  room_id uuid primary key references public.couple_rooms(id) on delete cascade,
  revision integer not null default 1,
  game integer not null default 1,
  starter integer not null check (starter in (1, 2)),
  turn_seat integer not null check (turn_seat in (1, 2)),
  phase text not null default 'setup' check (phase in ('setup', 'playing', 'finished')),
  secret1 text check (secret1 ~ '^[0-9]{3}$'),
  secret2 text check (secret2 ~ '^[0-9]{3}$'),
  -- [{ "seat": 1, "guess": "123", "s": 1, "b": 1 }, ...] in the order they were made
  guesses jsonb not null default '[]'::jsonb check (jsonb_typeof(guesses) = 'array'),
  solved boolean[] not null default '{false,false}',
  winner integer check (winner in (0, 1, 2)),
  wins integer[] not null default '{0,0}',
  draws integer not null default 0
);
alter table duri_private.baseball_games enable row level security;
revoke all on duri_private.baseball_games from public, anon, authenticated;
create trigger baseball_changed after insert or update on duri_private.baseball_games
  for each row execute function duri_private.broadcast_room_event('baseball');

-- Three different digits.
create function duri_private.baseball_valid(n text) returns boolean
language sql immutable set search_path='' as $$
  select n ~ '^[0-9]{3}$' and substr(n,1,1) <> substr(n,2,1) and substr(n,1,1) <> substr(n,3,1) and substr(n,2,1) <> substr(n,3,1)
$$;

-- {strikes, balls} of guess against secret.
create function duri_private.baseball_score(secret text, guess text) returns integer[]
language sql immutable set search_path='' as $$
  select array[
    (select count(*)::int from generate_series(1,3) i where substr(secret,i,1) = substr(guess,i,1)),
    (select count(*)::int from generate_series(1,3) i where substr(secret,i,1) <> substr(guess,i,1) and strpos(secret, substr(guess,i,1)) > 0)
  ]
$$;

create function public.baseball_state(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare mine integer; g duri_private.baseball_games; n1 integer; n2 integer;
begin
  select m.seat into mine from public.couple_members m join public.couple_rooms r on r.id = m.room_id
    where m.room_id = target and m.user_id = auth.uid() and r.closed_at is null;
  if mine is null then raise exception 'Room unavailable'; end if;
  select * into g from duri_private.baseball_games where room_id = target;
  if not found then return jsonb_build_object('phase', 'idle', 'revision', 0, 'mySeat', mine, 'wins', '[0,0]'::jsonb, 'draws', 0); end if;
  select count(*) filter (where (x->>'seat')::int = 1), count(*) filter (where (x->>'seat')::int = 2) into n1, n2
    from jsonb_array_elements(g.guesses) x;
  return jsonb_build_object(
    'phase', g.phase, 'revision', g.revision, 'game', g.game, 'mySeat', mine,
    'starter', g.starter, 'turnSeat', g.turn_seat,
    'mySecret', case when mine = 1 then g.secret1 else g.secret2 end,
    'partnerReady', (case when mine = 1 then g.secret2 else g.secret1 end) is not null,
    'partnerSecret', case when g.phase = 'finished' then (case when mine = 1 then g.secret2 else g.secret1 end) end,
    'guesses', g.guesses, 'counts', jsonb_build_array(n1, n2),
    'solved', to_jsonb(g.solved), 'lastChance', g.phase = 'playing' and (g.solved[1] or g.solved[2]),
    'winner', g.winner, 'wins', to_jsonb(g.wins), 'draws', g.draws);
end; $$;

-- action 'secret' (setup) or 'guess' (my turn), with three different digits.
create function public.baseball_action(target uuid, expected_revision integer, action text, digits text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g duri_private.baseball_games; mine integer; other integer; sc integer[]; n_me integer; n_other integer;
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(target) for update;
  if not found then raise exception 'Room unavailable'; end if;
  if (select count(*) from public.couple_members where room_id = target) <> 2 then raise exception 'Partner needed'; end if;
  select seat into mine from public.couple_members where room_id = target and user_id = auth.uid();
  other := 3 - mine;
  select * into g from duri_private.baseball_games where room_id = target for update;
  if not found or expected_revision is distinct from g.revision then return public.baseball_state(target); end if;
  if digits is null or not duri_private.baseball_valid(digits) then raise exception 'Invalid number'; end if;

  if action = 'secret' then
    if g.phase <> 'setup' then raise exception 'Not in setup'; end if;
    if (mine = 1 and g.secret1 is not null) or (mine = 2 and g.secret2 is not null) then raise exception 'Secret already set'; end if;
    if mine = 1 then g.secret1 := digits; else g.secret2 := digits; end if;
    if g.secret1 is not null and g.secret2 is not null then g.phase := 'playing'; g.turn_seat := g.starter; end if;
  elsif action = 'guess' then
    if g.phase <> 'playing' then raise exception 'Not playing'; end if;
    if g.turn_seat <> mine then raise exception 'Not your turn'; end if;
    sc := duri_private.baseball_score(case when mine = 1 then g.secret2 else g.secret1 end, digits);
    g.guesses := g.guesses || jsonb_build_array(jsonb_build_object('seat', mine, 'guess', digits, 's', sc[1], 'b', sc[2]));
    if sc[1] = 3 then g.solved[mine] := true; end if;
    select count(*) filter (where (x->>'seat')::int = mine), count(*) filter (where (x->>'seat')::int = other)
      into n_me, n_other from jsonb_array_elements(g.guesses) x;
    if g.solved[mine] and n_other < n_me then
      g.turn_seat := other;                                  -- the partner's last chance
    elsif g.solved[1] or g.solved[2] then
      g.phase := 'finished';
      g.winner := case when g.solved[1] and g.solved[2] then 0 when g.solved[1] then 1 else 2 end;
    elsif n_me >= 20 and n_other >= 20 then
      g.phase := 'finished'; g.winner := 0;
    else
      g.turn_seat := other;
    end if;
    if g.phase = 'finished' then
      if g.winner = 0 then g.draws := g.draws + 1; else g.wins[g.winner] := g.wins[g.winner] + 1; end if;
    end if;
  else
    raise exception 'Invalid action';
  end if;

  g.revision := g.revision + 1;
  update duri_private.baseball_games set (revision, turn_seat, phase, secret1, secret2, guesses, solved, winner, wins, draws)
    = (g.revision, g.turn_seat, g.phase, g.secret1, g.secret2, g.guesses, g.solved, g.winner, g.wins, g.draws)
    where room_id = target;
  return public.baseball_state(target);
end; $$;

revoke all on function duri_private.baseball_valid(text), duri_private.baseball_score(text, text) from public, anon, authenticated;
revoke all on function public.baseball_state(uuid), public.baseball_action(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.baseball_state(uuid), public.baseball_action(uuid, integer, text, text) to authenticated;

-- The shared new-game flow learns 'baseball'.
alter table duri_private.game_requests drop constraint game_requests_kind_check;
alter table duri_private.game_requests add constraint game_requests_kind_check
  check (kind in ('guess','draw','gomoku','golf','post','poker','baseball'));

create or replace function duri_private.game_fingerprint(target uuid,kind text) returns text language plpgsql set search_path='' as $$
declare v text;
begin
 case kind
 when 'guess' then select id::text into v from public.guess_games where room_id=target order by created_at desc limit 1;
 when 'draw' then select id::text into v from public.draw_games where room_id=target order by created_at desc limit 1;
 when 'gomoku' then select id::text into v from public.gomoku_games where room_id=target order by created_at desc limit 1;
 when 'golf' then select id::text into v from public.golf_games where room_id=target order by created_at desc limit 1;
 when 'post' then select revision::text into v from duri_private.postcard_games where room_id=target;
 when 'poker' then select revision::text into v from duri_private.poker_games where room_id=target;
 when 'baseball' then select revision::text into v from duri_private.baseball_games where room_id=target;
 else raise exception 'Invalid game';end case;return coalesce(v,'idle');
end;$$;

create or replace function public.respond_new_game(target uuid, game_kind text, request_id uuid, accept boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare r duri_private.game_requests;g duri_private.poker_games;v integer;cat text;holes integer;drawer uuid;gid uuid;shuffled smallint[];
begin
 perform 1 from public.couple_rooms where id=target and closed_at is null and duri_private.is_member(target) for update;
 if not found then raise exception 'Room unavailable';end if;
 if (select count(*) from public.couple_members where room_id=target)<>2 then raise exception 'Partner needed';end if;
 select * into r from duri_private.game_requests where room_id=target and kind=game_kind for update;
 if not found or r.id is distinct from request_id or r.status<>'pending' then return public.game_request_state(target,game_kind);end if;
 if accept is null then raise exception 'Invalid response';end if;
 if accept and r.requester=auth.uid() then raise exception 'Partner must accept';end if;
 if not accept then update duri_private.game_requests set status='declined' where room_id=target and kind=game_kind;return public.game_request_state(target,game_kind);end if;
 if r.expires_at<=clock_timestamp() or r.fingerprint<>duri_private.game_fingerprint(target,game_kind) then raise exception 'Game changed; request again';end if;
 case game_kind
 when 'guess' then
  update public.guess_games set finished_at=clock_timestamp() where room_id=target and finished_at is null;
  perform public.start_guess_game(target);
 when 'draw' then
  select id,category,guesser into gid,cat,drawer from public.draw_games where room_id=target order by created_at desc limit 1 for update;
  if gid is not null then perform duri_private.expire_draw(gid);end if;
  update public.draw_games set finished_at=clock_timestamp(),result='cancelled' where room_id=target and result is null;
  perform public.start_draw_game(target,coalesce(cat,'mix'),case when drawer is null then true else drawer=auth.uid() end);
 when 'gomoku' then
  update public.gomoku_games set status='cancelled',finished_at=clock_timestamp() where room_id=target and status='open';
  perform public.start_gomoku(target);
 when 'golf' then
  select gg.id,gg.holes into gid,holes from public.golf_games gg where room_id=target order by created_at desc limit 1 for update;
  if gid is not null then perform duri_private.advance_golf(gid);end if;
  update public.golf_games set status='cancelled',finished_at=clock_timestamp() where room_id=target and status='open';
  perform public.start_golf(target,coalesce(holes,3));
 when 'post' then
  select array_agg(face::smallint order by gen_random_uuid()) into shuffled from generate_series(0,6) face cross join generate_series(1,2) copy;
  insert into duri_private.postcard_games(room_id,revision,starter,turn_seat,deck) values(target,1,1,1,shuffled)
  on conflict(room_id) do update set revision=postcard_games.revision+1,starter=3-postcard_games.starter,turn_seat=3-postcard_games.starter,deck=excluded.deck,owners=excluded.owners,opened='{}',hide_at=null;
 when 'poker' then
  select * into g from duri_private.poker_games where room_id=target for update;
  v:=coalesce(g.revision,0)+1;
  insert into duri_private.poker_games(room_id,revision,stack_bb,dealer,turn_seat,stacks) values(target,v,r.stack_bb,1,1,array[r.stack_bb*2,r.stack_bb*2])
  on conflict(room_id) do update set revision=v,stack_bb=r.stack_bb,stacks=excluded.stacks,bets='{0,0}',committed='{0,0}',hand=0,dealer=3-poker_games.dealer returning * into g;
  g:=duri_private.poker_deal(g);
  update duri_private.poker_games set (hand,dealer,turn_seat,phase,street,stacks,bets,committed,acted,min_raise,deck,board,hole1,hole2,revealed,winner,last_pot,last_action,ready)=(g.hand,g.dealer,g.turn_seat,g.phase,g.street,g.stacks,g.bets,g.committed,g.acted,g.min_raise,g.deck,g.board,g.hole1,g.hole2,g.revealed,g.winner,g.last_pot,g.last_action,g.ready) where room_id=target;
 when 'baseball' then
  -- A fresh game keeps the record; the other partner starts this time.
  insert into duri_private.baseball_games(room_id,starter,turn_seat) values(target,1,1)
  on conflict(room_id) do update set revision=baseball_games.revision+1,game=baseball_games.game+1,
    starter=3-baseball_games.starter,turn_seat=3-baseball_games.starter,phase='setup',secret1=null,secret2=null,
    guesses='[]'::jsonb,solved='{false,false}',winner=null;
 end case;
 update duri_private.game_requests set status='accepted' where room_id=target and kind=game_kind;
 return public.game_request_state(target,game_kind);
end;$$;

commit;
