-- P4-1: "100초 그림 퀴즈". One partner draws a secret word, the other guesses it within 100 seconds.
--  * The word lives in the private schema; draw_state() hands it to the drawer only
--    (the guesser gets it after the round is over).
--  * The deadline is set by this database (clock_timestamp), never by a browser clock.
--  * A round ends exactly once: every ending runs under a row lock and "where result is null".
--  * The realtime signal carries only the event name 'draw'; browsers re-read what they may see.
begin;

-- ---------------------------------------------------------------- word bank (private)
create table duri_private.draw_word_bank (
  category text not null check (category in ('food', 'animal', 'thing', 'place', 'date')),
  word text not null,
  alts text[] not null default '{}',
  primary key (category, word)
);
alter table duri_private.draw_word_bank enable row level security;
revoke all on duri_private.draw_word_bank from public, anon, authenticated;

insert into duri_private.draw_word_bank(category, word, alts) values
  ('food', '떡볶이', '{떡뽁이}'), ('food', '김밥', '{}'), ('food', '라면', '{}'), ('food', '피자', '{}'),
  ('food', '햄버거', '{버거}'), ('food', '치킨', '{후라이드치킨}'), ('food', '아이스크림', '{}'), ('food', '케이크', '{}'),
  ('food', '초밥', '{스시}'), ('food', '김치', '{}'), ('food', '비빔밥', '{}'), ('food', '붕어빵', '{}'),
  ('food', '호떡', '{}'), ('food', '샌드위치', '{}'), ('food', '도넛', '{도너츠,도나쓰}'), ('food', '수박', '{}'),
  ('food', '바나나', '{}'), ('food', '딸기', '{}'), ('food', '계란후라이', '{달걀프라이,계란프라이,달걀후라이}'), ('food', '커피', '{}'),
  ('animal', '고양이', '{냥이}'), ('animal', '강아지', '{개,멍멍이}'), ('animal', '기린', '{}'), ('animal', '펭귄', '{}'),
  ('animal', '코끼리', '{}'), ('animal', '토끼', '{}'), ('animal', '사자', '{}'), ('animal', '호랑이', '{}'),
  ('animal', '곰', '{}'), ('animal', '원숭이', '{}'), ('animal', '돼지', '{}'), ('animal', '오리', '{}'),
  ('animal', '물고기', '{생선}'), ('animal', '거북이', '{거북}'), ('animal', '나비', '{}'), ('animal', '상어', '{}'),
  ('animal', '고래', '{}'), ('animal', '판다', '{}'), ('animal', '개구리', '{}'), ('animal', '뱀', '{}'),
  ('thing', '우산', '{}'), ('thing', '안경', '{}'), ('thing', '시계', '{}'), ('thing', '자전거', '{}'),
  ('thing', '컵', '{머그컵}'), ('thing', '가방', '{}'), ('thing', '의자', '{}'), ('thing', '전화기', '{휴대폰,핸드폰,스마트폰,폰}'),
  ('thing', '열쇠', '{키,열쇠고리}'), ('thing', '카메라', '{}'), ('thing', '연필', '{}'), ('thing', '책', '{}'),
  ('thing', '모자', '{}'), ('thing', '신발', '{운동화}'), ('thing', '선풍기', '{}'), ('thing', '침대', '{}'),
  ('thing', '풍선', '{}'), ('thing', '촛불', '{초}'), ('thing', '기타', '{}'), ('thing', '선물상자', '{선물}'),
  ('place', '학교', '{}'), ('place', '병원', '{}'), ('place', '공원', '{}'), ('place', '바다', '{}'),
  ('place', '산', '{}'), ('place', '영화관', '{극장}'), ('place', '도서관', '{}'), ('place', '지하철', '{전철}'),
  ('place', '놀이공원', '{놀이동산}'), ('place', '공항', '{}'), ('place', '카페', '{}'), ('place', '편의점', '{}'),
  ('place', '해변', '{바닷가}'), ('place', '캠핑장', '{캠핑}'), ('place', '수영장', '{}'), ('place', '동물원', '{}'),
  ('place', '박물관', '{}'), ('place', '노래방', '{}'), ('place', '한강', '{}'), ('place', '집', '{}'),
  ('date', '손잡기', '{}'), ('date', '영화보기', '{영화관람}'), ('date', '피크닉', '{소풍}'), ('date', '롤러코스터', '{놀이기구}'),
  ('date', '불꽃놀이', '{}'), ('date', '별보기', '{}'), ('date', '셀카', '{셀피,사진찍기}'), ('date', '커플링', '{반지}'),
  ('date', '꽃다발', '{꽃}'), ('date', '하트', '{}'), ('date', '포옹', '{허그,안기}'), ('date', '편지', '{러브레터}'),
  ('date', '드라이브', '{}'), ('date', '산책', '{}'), ('date', '스케이트', '{아이스스케이트}'), ('date', '보드게임', '{}'),
  ('date', '요리하기', '{요리}'), ('date', '쇼핑', '{}'), ('date', '우산같이쓰기', '{}'), ('date', '커플룩', '{}');

-- ---------------------------------------------------------------- tables
create table public.draw_games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  category text not null check (category in ('food', 'animal', 'thing', 'place', 'date')),
  drawer uuid not null references auth.users(id) on delete cascade,
  guesser uuid not null references auth.users(id) on delete cascade,
  drawer_ready boolean not null default false,
  guesser_ready boolean not null default false,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  deadline_at timestamptz,
  result text check (result in ('won', 'timeout', 'cancelled')),
  finished_at timestamptz,
  seconds numeric(6, 2),
  check ((started_at is null) = (deadline_at is null)),
  check (drawer <> guesser)
);
create unique index draw_games_one_open on public.draw_games(room_id) where result is null;
create index on public.draw_games(room_id, created_at desc);

-- The secret word: no grants, RLS on, no policy. Only the definer functions read it.
create table duri_private.draw_words (
  game_id uuid primary key references public.draw_games(id) on delete cascade,
  word text not null,
  alts text[] not null default '{}'
);
alter table duri_private.draw_words enable row level security;
revoke all on duri_private.draw_words from public, anon, authenticated;

-- A stroke is sent in segments while the pen is down, so the partner sees it grow.
-- "segment" is the idempotency key: a resent segment is ignored.
create table public.draw_strokes (
  seq bigint generated always as identity primary key,
  game_id uuid not null references public.draw_games(id) on delete cascade,
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  stroke uuid not null,
  segment uuid not null unique,
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  width smallint not null check (width between 1 and 40),
  points jsonb not null,
  created_at timestamptz not null default now()
);
create index on public.draw_strokes(game_id, seq);

create table public.draw_guesses (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.draw_games(id) on delete cascade,
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  player uuid not null references auth.users(id) on delete cascade,
  guess text not null check (char_length(guess) between 1 and 30),
  correct boolean not null,
  created_at timestamptz not null default now()
);
create index on public.draw_guesses(game_id, id);

create table public.draw_records (
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  category text not null check (category in ('food', 'animal', 'thing', 'place', 'date')),
  best_seconds numeric(6, 2) not null,
  achieved_at timestamptz not null default now(),
  primary key (room_id, category)
);

alter table public.draw_games enable row level security;
alter table public.draw_strokes enable row level security;
alter table public.draw_guesses enable row level security;
alter table public.draw_records enable row level security;
revoke all on public.draw_games, public.draw_strokes, public.draw_guesses, public.draw_records from public, anon, authenticated;
grant select on public.draw_games, public.draw_strokes, public.draw_guesses, public.draw_records to authenticated;
create policy room_members_read_draw_games on public.draw_games for select to authenticated using (duri_private.is_member(room_id));
create policy room_members_read_draw_strokes on public.draw_strokes for select to authenticated using (duri_private.is_member(room_id));
create policy room_members_read_draw_guesses on public.draw_guesses for select to authenticated using (duri_private.is_member(room_id));
create policy room_members_read_draw_records on public.draw_records for select to authenticated using (duri_private.is_member(room_id));

-- ---------------------------------------------------------------- helpers
-- Strip spaces and punctuation and lower-case, so "아이스 크림" matches "아이스크림".
create function duri_private.draw_norm(t text) returns text
language sql immutable set search_path='' as $$
  select lower(pg_catalog.regexp_replace(t, '[[:space:]\-_.,!?~''"]+', '', 'g'));
$$;
revoke all on function duri_private.draw_norm(text) from public, anon, authenticated;

-- Ends an overdue round as "timeout". The caller already holds the game row lock when it matters;
-- "where result is null" makes the ending happen once even if two callers get here.
create function duri_private.expire_draw(gid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.draw_games set result = 'timeout', finished_at = clock_timestamp()
    where id = gid and result is null and started_at is not null and deadline_at <= clock_timestamp();
end; $$;
revoke all on function duri_private.expire_draw(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- commands
create function public.start_draw_game(target uuid, cat text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); partner uuid; last_drawer uuid; gid uuid; w record; who uuid;
begin
  if cat is null or cat not in ('food', 'animal', 'thing', 'place', 'date') then raise exception 'Invalid category'; end if;
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  select user_id into partner from public.couple_members where room_id = target and user_id <> actor;
  if partner is null then raise exception 'Partner needed'; end if;
  -- A round that already ran out is closed first, so it does not block a new one.
  perform duri_private.expire_draw(id) from public.draw_games where room_id = target and result is null;
  select id into gid from public.draw_games where room_id = target and result is null;
  if found then return gid; end if;
  -- Roles swap every round: the one who guessed last time draws now.
  select drawer into last_drawer from public.draw_games
    where room_id = target and result in ('won', 'timeout') order by created_at desc limit 1;
  who := case when last_drawer = actor then partner else actor end;
  -- Skip words this room played in its last 8 rounds.
  select b.word, b.alts into w from duri_private.draw_word_bank b
    where b.category = cat and b.word not in (
      select dw.word from duri_private.draw_words dw join public.draw_games dg on dg.id = dw.game_id
        where dg.room_id = target order by dg.created_at desc limit 8)
    order by random() limit 1;
  insert into public.draw_games(room_id, category, drawer, guesser)
    values (target, cat, who, case when who = actor then partner else actor end) returning id into gid;
  insert into duri_private.draw_words(game_id, word, alts) values (gid, w.word, w.alts);
  return gid;
end; $$;

-- Lobby only: lets the pair pick another category before anyone drew a line.
create function public.cancel_draw_game(game uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.draw_games g set result = 'cancelled', finished_at = clock_timestamp()
    from public.couple_rooms r
    where g.id = game and g.result is null and g.started_at is null
      and r.id = g.room_id and r.closed_at is null and duri_private.is_member(g.room_id);
  if not found then raise exception 'Game unavailable'; end if;
end; $$;

create function public.ready_draw_game(game uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); gm public.draw_games;
begin
  select g.* into gm from public.draw_games g join public.couple_rooms r on r.id = g.room_id
    where g.id = game and g.result is null and r.closed_at is null and duri_private.is_member(g.room_id)
    for update of g;
  if not found then raise exception 'Game unavailable'; end if;
  if gm.started_at is not null then return; end if;          -- pressing again is harmless
  update public.draw_games set
      drawer_ready = drawer_ready or actor = drawer,
      guesser_ready = guesser_ready or actor = guesser
    where id = game returning * into gm;
  -- Both are ready: the database starts the clock. 100 seconds from this instant.
  if gm.drawer_ready and gm.guesser_ready then
    update public.draw_games set started_at = clock_timestamp(), deadline_at = clock_timestamp() + interval '100 seconds'
      where id = game;
  end if;
end; $$;

-- Returns false when the round is over (the line is simply not drawn).
create function public.add_draw_stroke(game uuid, stroke_id uuid, segment_id uuid, pen_color text, pen_width smallint, pts jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); gm public.draw_games;
begin
  select g.* into gm from public.draw_games g join public.couple_rooms r on r.id = g.room_id
    where g.id = game and r.closed_at is null and duri_private.is_member(g.room_id) for update of g;
  if not found or gm.drawer <> actor then raise exception 'Game unavailable'; end if;
  if gm.result is not null then return false; end if;
  if gm.started_at is null then raise exception 'Game unavailable'; end if;
  if gm.deadline_at <= clock_timestamp() then perform duri_private.expire_draw(game); return false; end if;
  if pen_color is null or pen_color !~ '^#[0-9a-f]{6}$' or pen_width is null or pen_width not between 1 and 40
     or pts is null or jsonb_typeof(pts) <> 'array' or jsonb_array_length(pts) not between 1 and 250 then
    raise exception 'Invalid stroke';
  end if;
  if exists (select 1 from jsonb_array_elements(pts) e where not (
       case when jsonb_typeof(e) = 'array' and jsonb_array_length(e) = 2
                 and jsonb_typeof(e->0) = 'number' and jsonb_typeof(e->1) = 'number'
            then (e->>0)::numeric between 0 and 1000 and (e->>1)::numeric between 0 and 1000
            else false end)) then
    raise exception 'Invalid stroke';
  end if;
  if (select count(*) from public.draw_strokes where game_id = game) >= 800 then raise exception 'Too many strokes'; end if;
  insert into public.draw_strokes(game_id, room_id, stroke, segment, color, width, points)
    values (game, gm.room_id, stroke_id, segment_id, pen_color, pen_width, pts)
    on conflict (segment) do nothing;
  return true;
end; $$;

-- Removes the whole last stroke (all of its segments).
create function public.undo_draw_stroke(game uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); gm public.draw_games;
begin
  select g.* into gm from public.draw_games g join public.couple_rooms r on r.id = g.room_id
    where g.id = game and r.closed_at is null and duri_private.is_member(g.room_id) for update of g;
  if not found or gm.drawer <> actor then raise exception 'Game unavailable'; end if;
  if gm.result is not null or gm.started_at is null then return; end if;
  if gm.deadline_at <= clock_timestamp() then perform duri_private.expire_draw(game); return; end if;
  delete from public.draw_strokes where game_id = game and stroke = (
    select stroke from public.draw_strokes where game_id = game order by seq desc limit 1);
end; $$;

create function public.clear_draw_strokes(game uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); gm public.draw_games;
begin
  select g.* into gm from public.draw_games g join public.couple_rooms r on r.id = g.room_id
    where g.id = game and r.closed_at is null and duri_private.is_member(g.room_id) for update of g;
  if not found or gm.drawer <> actor then raise exception 'Game unavailable'; end if;
  if gm.result is not null or gm.started_at is null then return; end if;
  if gm.deadline_at <= clock_timestamp() then perform duri_private.expire_draw(game); return; end if;
  delete from public.draw_strokes where game_id = game;
end; $$;

-- The guesser's answer. Returns 'correct', 'wrong' or 'closed' (round already over).
create function public.guess_draw(game uuid, attempt text) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); gm public.draw_games; w duri_private.draw_words; n text; hit boolean; took numeric;
begin
  select g.* into gm from public.draw_games g join public.couple_rooms r on r.id = g.room_id
    where g.id = game and r.closed_at is null and duri_private.is_member(g.room_id) for update of g;
  if not found or gm.guesser <> actor then raise exception 'Game unavailable'; end if;
  if gm.result is not null or gm.started_at is null then return 'closed'; end if;
  if gm.deadline_at <= clock_timestamp() then perform duri_private.expire_draw(game); return 'closed'; end if;
  if attempt is null or char_length(btrim(attempt)) not between 1 and 30 then raise exception 'Invalid guess'; end if;
  n := duri_private.draw_norm(attempt);
  if n = '' then raise exception 'Invalid guess'; end if;
  if (select count(*) from public.draw_guesses where game_id = game) >= 80 then raise exception 'Too many guesses'; end if;
  select * into w from duri_private.draw_words where game_id = game;
  hit := exists (select 1 from unnest(array[w.word] || w.alts) c where duri_private.draw_norm(c) = n);
  insert into public.draw_guesses(game_id, room_id, player, guess, correct)
    values (game, gm.room_id, actor, btrim(attempt), hit);
  if not hit then return 'wrong'; end if;
  took := round(extract(epoch from (clock_timestamp() - gm.started_at))::numeric, 2);
  update public.draw_games set result = 'won', finished_at = clock_timestamp(), seconds = took
    where id = game and result is null;
  insert into public.draw_records(room_id, category, best_seconds) values (gm.room_id, gm.category, took)
    on conflict (room_id, category) do update set best_seconds = excluded.best_seconds, achieved_at = now()
    where excluded.best_seconds < public.draw_records.best_seconds;
  return 'correct';
end; $$;

-- What the caller may see. The word goes to the drawer once the round starts; the guesser
-- gets it only when the round is over. Times are epoch milliseconds from the database clock,
-- so both screens can show the same countdown whatever their own clocks say.
create function public.draw_state(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); gm public.draw_games; w duri_private.draw_words; is_drawer boolean; recs jsonb;
begin
  if not duri_private.is_member(target) then raise exception 'Room unavailable'; end if;
  select coalesce(jsonb_object_agg(category, best_seconds), '{}'::jsonb) into recs from public.draw_records where room_id = target;
  select * into gm from public.draw_games where room_id = target and result is distinct from 'cancelled' order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('game', null, 'nowMs', (extract(epoch from clock_timestamp()) * 1000)::bigint, 'records', recs);
  end if;
  if gm.result is null and gm.started_at is not null and gm.deadline_at <= clock_timestamp() then
    perform 1 from public.draw_games where id = gm.id for update;
    perform duri_private.expire_draw(gm.id);
    select * into gm from public.draw_games where id = gm.id;
  end if;
  is_drawer := actor = gm.drawer;
  select * into w from duri_private.draw_words where game_id = gm.id;
  return jsonb_build_object(
    'game', gm.id,
    'category', gm.category,
    'role', case when is_drawer then 'drawer' else 'guesser' end,
    'phase', case when gm.result is not null then 'done' when gm.started_at is null then 'lobby' else 'live' end,
    'meReady', case when is_drawer then gm.drawer_ready else gm.guesser_ready end,
    'partnerReady', case when is_drawer then gm.guesser_ready else gm.drawer_ready end,
    'nowMs', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'startedMs', (extract(epoch from gm.started_at) * 1000)::bigint,
    'deadlineMs', (extract(epoch from gm.deadline_at) * 1000)::bigint,
    'result', gm.result,
    'seconds', gm.seconds,
    'word', case when gm.started_at is null then null
                 when is_drawer then w.word
                 when gm.result in ('won', 'timeout') then w.word
                 else null end,
    'records', recs
  );
end; $$;

revoke all on function public.start_draw_game(uuid, text), public.cancel_draw_game(uuid), public.ready_draw_game(uuid),
  public.add_draw_stroke(uuid, uuid, uuid, text, smallint, jsonb), public.undo_draw_stroke(uuid), public.clear_draw_strokes(uuid),
  public.guess_draw(uuid, text), public.draw_state(uuid) from public, anon, authenticated;
grant execute on function public.start_draw_game(uuid, text), public.cancel_draw_game(uuid), public.ready_draw_game(uuid),
  public.add_draw_stroke(uuid, uuid, uuid, text, smallint, jsonb), public.undo_draw_stroke(uuid), public.clear_draw_strokes(uuid),
  public.guess_draw(uuid, text), public.draw_state(uuid) to authenticated;

-- ---------------------------------------------------------------- live signals (event name only)
create trigger draw_games_notify after insert or update on public.draw_games
  for each row execute function duri_private.broadcast_room_event('draw');
create trigger draw_strokes_notify after insert or delete on public.draw_strokes
  for each row execute function duri_private.broadcast_room_event('draw');
create trigger draw_guesses_notify after insert on public.draw_guesses
  for each row execute function duri_private.broadcast_room_event('draw');

commit;
