-- P6-3: "100초 그림 퀴즈" 2판 — 100초 동안 최대한 많이.
--  * One round = 100 seconds and many words. A correct answer scores 1 and the next word appears at once;
--    the drawer may pass (no score). The best record is the most words solved in 100 seconds (per category).
--  * Who draws is chosen when the round starts ("내가 그릴게요" / "상대가 그려요").
--  * 300 words (60 per category) plus a "전부 섞기" category. Each new word is the one this room has not
--    seen for the longest time, so the next round brings different words.
--  * Strokes and guesses belong to a word number, so each word starts on a clean board.
--  * Still: the current word never reaches the guesser; the database keeps the clock; one ending only.
begin;

insert into duri_private.draw_word_bank(category, word, alts) values
  ('food', '사과', '{}'),
  ('food', '포도', '{}'),
  ('food', '귤', '{}'),
  ('food', '복숭아', '{}'),
  ('food', '파인애플', '{}'),
  ('food', '체리', '{}'),
  ('food', '레몬', '{}'),
  ('food', '당근', '{}'),
  ('food', '옥수수', '{}'),
  ('food', '감자', '{}'),
  ('food', '고구마', '{}'),
  ('food', '버섯', '{}'),
  ('food', '토마토', '{}'),
  ('food', '브로콜리', '{}'),
  ('food', '오이', '{}'),
  ('food', '핫도그', '{}'),
  ('food', '감자튀김', '{프렌치프라이}'),
  ('food', '팝콘', '{}'),
  ('food', '솜사탕', '{}'),
  ('food', '사탕', '{}'),
  ('food', '초콜릿', '{초코}'),
  ('food', '쿠키', '{}'),
  ('food', '마카롱', '{}'),
  ('food', '와플', '{}'),
  ('food', '팬케이크', '{핫케이크}'),
  ('food', '식빵', '{빵}'),
  ('food', '우유', '{}'),
  ('food', '주스', '{}'),
  ('food', '콜라', '{}'),
  ('food', '빙수', '{팥빙수}'),
  ('food', '만두', '{}'),
  ('food', '짜장면', '{자장면}'),
  ('food', '삼겹살', '{고기}'),
  ('food', '소시지', '{}'),
  ('food', '새우', '{}'),
  ('food', '오징어', '{}'),
  ('food', '문어', '{}'),
  ('food', '꼬치', '{}'),
  ('food', '밥', '{쌀밥}'),
  ('food', '국수', '{}'),
  ('animal', '말', '{}'),
  ('animal', '소', '{젖소}'),
  ('animal', '양', '{}'),
  ('animal', '염소', '{}'),
  ('animal', '닭', '{}'),
  ('animal', '병아리', '{}'),
  ('animal', '쥐', '{}'),
  ('animal', '햄스터', '{}'),
  ('animal', '다람쥐', '{}'),
  ('animal', '여우', '{}'),
  ('animal', '늑대', '{}'),
  ('animal', '사슴', '{}'),
  ('animal', '얼룩말', '{}'),
  ('animal', '하마', '{}'),
  ('animal', '코뿔소', '{}'),
  ('animal', '캥거루', '{}'),
  ('animal', '코알라', '{}'),
  ('animal', '낙타', '{}'),
  ('animal', '악어', '{}'),
  ('animal', '공룡', '{}'),
  ('animal', '게', '{}'),
  ('animal', '해파리', '{}'),
  ('animal', '불가사리', '{}'),
  ('animal', '달팽이', '{}'),
  ('animal', '거미', '{}'),
  ('animal', '개미', '{}'),
  ('animal', '벌', '{꿀벌}'),
  ('animal', '무당벌레', '{}'),
  ('animal', '잠자리', '{}'),
  ('animal', '부엉이', '{올빼미}'),
  ('animal', '독수리', '{}'),
  ('animal', '앵무새', '{}'),
  ('animal', '비둘기', '{}'),
  ('animal', '백조', '{}'),
  ('animal', '홍학', '{}'),
  ('animal', '박쥐', '{}'),
  ('animal', '고슴도치', '{}'),
  ('animal', '수달', '{}'),
  ('animal', '물개', '{}'),
  ('animal', '너구리', '{}'),
  ('thing', '가위', '{}'),
  ('thing', '칫솔', '{}'),
  ('thing', '거울', '{}'),
  ('thing', '빗', '{}'),
  ('thing', '숟가락', '{수저}'),
  ('thing', '젓가락', '{}'),
  ('thing', '포크', '{}'),
  ('thing', '냄비', '{}'),
  ('thing', '프라이팬', '{}'),
  ('thing', '냉장고', '{}'),
  ('thing', '텔레비전', '{티비,tv,텔레비젼}'),
  ('thing', '컴퓨터', '{}'),
  ('thing', '노트북', '{}'),
  ('thing', '헤드폰', '{헤드셋}'),
  ('thing', '리모컨', '{}'),
  ('thing', '전구', '{}'),
  ('thing', '램프', '{스탠드}'),
  ('thing', '소파', '{}'),
  ('thing', '책상', '{}'),
  ('thing', '문', '{}'),
  ('thing', '창문', '{}'),
  ('thing', '계단', '{}'),
  ('thing', '사다리', '{}'),
  ('thing', '망치', '{}'),
  ('thing', '못', '{}'),
  ('thing', '자', '{}'),
  ('thing', '지우개', '{}'),
  ('thing', '공책', '{노트}'),
  ('thing', '편지봉투', '{봉투}'),
  ('thing', '왕관', '{}'),
  ('thing', '목걸이', '{}'),
  ('thing', '장갑', '{}'),
  ('thing', '양말', '{}'),
  ('thing', '넥타이', '{}'),
  ('thing', '치마', '{}'),
  ('thing', '바지', '{}'),
  ('thing', '티셔츠', '{티}'),
  ('thing', '비행기', '{}'),
  ('thing', '자동차', '{차}'),
  ('thing', '기차', '{}'),
  ('place', '교회', '{}'),
  ('place', '성당', '{}'),
  ('place', '절', '{}'),
  ('place', '경찰서', '{}'),
  ('place', '소방서', '{}'),
  ('place', '우체국', '{}'),
  ('place', '은행', '{}'),
  ('place', '시장', '{}'),
  ('place', '마트', '{}'),
  ('place', '백화점', '{}'),
  ('place', '빵집', '{}'),
  ('place', '식당', '{}'),
  ('place', '미용실', '{}'),
  ('place', '헬스장', '{}'),
  ('place', '볼링장', '{}'),
  ('place', '스키장', '{}'),
  ('place', '운동장', '{}'),
  ('place', '축구장', '{}'),
  ('place', '야구장', '{}'),
  ('place', '놀이터', '{}'),
  ('place', '다리', '{}'),
  ('place', '섬', '{}'),
  ('place', '사막', '{}'),
  ('place', '동굴', '{}'),
  ('place', '폭포', '{}'),
  ('place', '호수', '{}'),
  ('place', '강', '{}'),
  ('place', '숲', '{}'),
  ('place', '농장', '{}'),
  ('place', '등대', '{}'),
  ('place', '성', '{}'),
  ('place', '피라미드', '{}'),
  ('place', '에펠탑', '{}'),
  ('place', '기차역', '{역}'),
  ('place', '버스정류장', '{정류장}'),
  ('place', '주유소', '{}'),
  ('place', '호텔', '{}'),
  ('place', '사무실', '{}'),
  ('place', '화장실', '{}'),
  ('place', '부엌', '{주방}'),
  ('date', '뽀뽀', '{}'),
  ('date', '고백', '{}'),
  ('date', '프러포즈', '{청혼,프로포즈}'),
  ('date', '기념일', '{}'),
  ('date', '생일파티', '{생일}'),
  ('date', '케이블카', '{}'),
  ('date', '관람차', '{대관람차}'),
  ('date', '자전거타기', '{자전거}'),
  ('date', '캠핑하기', '{캠핑}'),
  ('date', '낚시', '{}'),
  ('date', '등산', '{}'),
  ('date', '수영하기', '{수영}'),
  ('date', '스키타기', '{스키}'),
  ('date', '볼링치기', '{볼링}'),
  ('date', '노래부르기', '{노래}'),
  ('date', '춤추기', '{춤}'),
  ('date', '게임하기', '{게임}'),
  ('date', '그림그리기', '{그림}'),
  ('date', '책읽기', '{독서,책}'),
  ('date', '낮잠', '{}'),
  ('date', '영상통화', '{}'),
  ('date', '여행가기', '{여행}'),
  ('date', '비행기타기', '{비행기}'),
  ('date', '눈사람만들기', '{눈사람}'),
  ('date', '눈싸움', '{}'),
  ('date', '벚꽃구경', '{벚꽃}'),
  ('date', '단풍구경', '{단풍}'),
  ('date', '일출보기', '{일출,해돋이}'),
  ('date', '커플사진', '{}'),
  ('date', '맛집탐방', '{맛집}'),
  ('date', '빙수먹기', '{빙수}'),
  ('date', '홈카페', '{}'),
  ('date', '퍼즐맞추기', '{퍼즐}'),
  ('date', '방탈출', '{}'),
  ('date', '동물원가기', '{동물원}'),
  ('date', '놀이공원가기', '{놀이공원,놀이동산}'),
  ('date', '야경보기', '{야경}'),
  ('date', '캠프파이어', '{}'),
  ('date', '바다수영', '{}'),
  ('date', '줄넘기', '{}')
  on conflict do nothing;

-- ---------------------------------------------------------------- tables
alter table public.draw_games drop constraint draw_games_category_check;
alter table public.draw_games add constraint draw_games_category_check check (category in ('food', 'animal', 'thing', 'place', 'date', 'mix'));
alter table public.draw_games add column score integer not null default 0;
alter table public.draw_games add column word_no integer not null default 1;
alter table public.draw_games add column passes integer not null default 0;

alter table duri_private.draw_words drop constraint draw_words_pkey;
alter table duri_private.draw_words add column n integer not null default 1;
alter table duri_private.draw_words add column outcome text check (outcome in ('correct', 'pass'));
alter table duri_private.draw_words add column created_at timestamptz not null default clock_timestamp();
alter table duri_private.draw_words add primary key (game_id, n);

alter table public.draw_strokes add column word_no integer not null default 1;
alter table public.draw_guesses add column word_no integer not null default 1;

-- Records used to be seconds for one word; now they count words. Old seconds are not comparable.
delete from public.draw_records;
alter table public.draw_records drop column best_seconds;
alter table public.draw_records add column best_score integer not null check (best_score > 0);
alter table public.draw_records drop constraint draw_records_category_check;
alter table public.draw_records add constraint draw_records_category_check check (category in ('food', 'animal', 'thing', 'place', 'date', 'mix'));

-- ---------------------------------------------------------------- helpers
-- Adds word number n to a game: the word of its category (any category for 'mix') that this room
-- has not seen for the longest time, never one already used in this game.
create function duri_private.draw_pick(gid uuid, n integer) returns void
language plpgsql security definer set search_path='' as $$
declare rid uuid; cat text;
begin
  select room_id, category into rid, cat from public.draw_games where id = gid;
  insert into duri_private.draw_words(game_id, n, word, alts)
    select gid, n, b.word, b.alts from duri_private.draw_word_bank b
    left join lateral (
      select max(dw.created_at) as last_seen from duri_private.draw_words dw join public.draw_games dg on dg.id = dw.game_id
      where dg.room_id = rid and dw.word = b.word) s on true
    where (cat = 'mix' or b.category = cat)
      and b.word not in (select word from duri_private.draw_words where game_id = gid)
    order by s.last_seen nulls first, random()
    limit 1;
end; $$;
revoke all on function duri_private.draw_pick(uuid, integer) from public, anon, authenticated;

-- Ends an overdue round once and keeps the pair's best count for the category.
create or replace function duri_private.expire_draw(gid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare gm public.draw_games;
begin
  update public.draw_games set result = 'timeout', finished_at = clock_timestamp()
    where id = gid and result is null and started_at is not null and deadline_at <= clock_timestamp()
    returning * into gm;
  if found and gm.score > 0 then
    insert into public.draw_records(room_id, category, best_score) values (gm.room_id, gm.category, gm.score)
      on conflict (room_id, category) do update set best_score = excluded.best_score, achieved_at = now()
      where excluded.best_score > public.draw_records.best_score;
  end if;
end; $$;

-- ---------------------------------------------------------------- commands
-- i_draw: true = I draw, false = my partner draws, null = swap with the last round.
create function public.start_draw_game(target uuid, cat text, i_draw boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); partner uuid; last_drawer uuid; gid uuid; who uuid;
begin
  if cat is null or cat not in ('food', 'animal', 'thing', 'place', 'date', 'mix') then raise exception 'Invalid category'; end if;
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  select user_id into partner from public.couple_members where room_id = target and user_id <> actor;
  if partner is null then raise exception 'Partner needed'; end if;
  perform duri_private.expire_draw(id) from public.draw_games where room_id = target and result is null;
  select id into gid from public.draw_games where room_id = target and result is null;
  if found then return gid; end if;
  if i_draw is null then
    select drawer into last_drawer from public.draw_games
      where room_id = target and result in ('won', 'timeout') order by created_at desc limit 1;
    who := case when last_drawer = actor then partner else actor end;
  else
    who := case when i_draw then actor else partner end;
  end if;
  insert into public.draw_games(room_id, category, drawer, guesser)
    values (target, cat, who, case when who = actor then partner else actor end) returning id into gid;
  perform duri_private.draw_pick(gid, 1);
  return gid;
end; $$;

-- The old two-argument form (pages still open from before this change) keeps working.
create or replace function public.start_draw_game(target uuid, cat text) returns uuid
language sql security definer set search_path='' as $$
  select public.start_draw_game(target, cat, null::boolean);
$$;

create or replace function public.add_draw_stroke(game uuid, stroke_id uuid, segment_id uuid, pen_color text, pen_width smallint, pts jsonb) returns boolean
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
  if (select count(*) from public.draw_strokes where game_id = game) >= 3000 then raise exception 'Too many strokes'; end if;
  insert into public.draw_strokes(game_id, room_id, stroke, segment, color, width, points, word_no)
    values (game, gm.room_id, stroke_id, segment_id, pen_color, pen_width, pts, gm.word_no)
    on conflict (segment) do nothing;
  return true;
end; $$;

create or replace function public.undo_draw_stroke(game uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); gm public.draw_games;
begin
  select g.* into gm from public.draw_games g join public.couple_rooms r on r.id = g.room_id
    where g.id = game and r.closed_at is null and duri_private.is_member(g.room_id) for update of g;
  if not found or gm.drawer <> actor then raise exception 'Game unavailable'; end if;
  if gm.result is not null or gm.started_at is null then return; end if;
  if gm.deadline_at <= clock_timestamp() then perform duri_private.expire_draw(game); return; end if;
  delete from public.draw_strokes where game_id = game and word_no = gm.word_no and stroke = (
    select stroke from public.draw_strokes where game_id = game and word_no = gm.word_no order by seq desc limit 1);
end; $$;

create or replace function public.clear_draw_strokes(game uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); gm public.draw_games;
begin
  select g.* into gm from public.draw_games g join public.couple_rooms r on r.id = g.room_id
    where g.id = game and r.closed_at is null and duri_private.is_member(g.room_id) for update of g;
  if not found or gm.drawer <> actor then raise exception 'Game unavailable'; end if;
  if gm.result is not null or gm.started_at is null then return; end if;
  if gm.deadline_at <= clock_timestamp() then perform duri_private.expire_draw(game); return; end if;
  delete from public.draw_strokes where game_id = game and word_no = gm.word_no;
end; $$;

-- The guesser's answer for the current word. 'correct' scores 1 and moves to the next word;
-- 'wrong' retries; 'closed' when the round is over.
create or replace function public.guess_draw(game uuid, attempt text) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); gm public.draw_games; w duri_private.draw_words; n text; hit boolean;
begin
  select g.* into gm from public.draw_games g join public.couple_rooms r on r.id = g.room_id
    where g.id = game and r.closed_at is null and duri_private.is_member(g.room_id) for update of g;
  if not found or gm.guesser <> actor then raise exception 'Game unavailable'; end if;
  if gm.result is not null or gm.started_at is null then return 'closed'; end if;
  if gm.deadline_at <= clock_timestamp() then perform duri_private.expire_draw(game); return 'closed'; end if;
  if attempt is null or char_length(btrim(attempt)) not between 1 and 30 then raise exception 'Invalid guess'; end if;
  n := duri_private.draw_norm(attempt);
  if n = '' then raise exception 'Invalid guess'; end if;
  if (select count(*) from public.draw_guesses where game_id = game) >= 400 then raise exception 'Too many guesses'; end if;
  select * into w from duri_private.draw_words where game_id = game and draw_words.n = gm.word_no;
  hit := exists (select 1 from unnest(array[w.word] || w.alts) c where duri_private.draw_norm(c) = n);
  insert into public.draw_guesses(game_id, room_id, player, guess, correct, word_no)
    values (game, gm.room_id, actor, btrim(attempt), hit, gm.word_no);
  if not hit then return 'wrong'; end if;
  update duri_private.draw_words set outcome = 'correct' where game_id = game and draw_words.n = gm.word_no;
  update public.draw_games set score = score + 1, word_no = word_no + 1 where id = game;
  perform duri_private.draw_pick(game, gm.word_no + 1);
  return 'correct';
end; $$;

-- The drawer skips a hard word: no score, next word.
create function public.pass_draw_word(game uuid) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); gm public.draw_games;
begin
  select g.* into gm from public.draw_games g join public.couple_rooms r on r.id = g.room_id
    where g.id = game and r.closed_at is null and duri_private.is_member(g.room_id) for update of g;
  if not found or gm.drawer <> actor then raise exception 'Game unavailable'; end if;
  if gm.result is not null or gm.started_at is null then return 'closed'; end if;
  if gm.deadline_at <= clock_timestamp() then perform duri_private.expire_draw(game); return 'closed'; end if;
  update duri_private.draw_words set outcome = 'pass' where game_id = game and n = gm.word_no;
  update public.draw_games set passes = passes + 1, word_no = word_no + 1 where id = game;
  perform duri_private.draw_pick(game, gm.word_no + 1);
  return 'ok';
end; $$;

-- What the caller may see. The current word goes to the drawer only; earlier words (solved or passed)
-- are shown to both; when the round is over every word is shown.
create or replace function public.draw_state(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); gm public.draw_games; cur text; is_drawer boolean; recs jsonb; words jsonb;
begin
  if not duri_private.is_member(target) then raise exception 'Room unavailable'; end if;
  select * into gm from public.draw_games where room_id = target and result is distinct from 'cancelled' order by created_at desc limit 1;
  if found and gm.result is null and gm.started_at is not null and gm.deadline_at <= clock_timestamp() then
    perform 1 from public.draw_games where id = gm.id for update;
    perform duri_private.expire_draw(gm.id);
    select * into gm from public.draw_games where id = gm.id;
  end if;
  select coalesce(jsonb_object_agg(category, best_score), '{}'::jsonb) into recs from public.draw_records where room_id = target;
  if gm.id is null then
    return jsonb_build_object('game', null, 'nowMs', (extract(epoch from clock_timestamp()) * 1000)::bigint, 'records', recs);
  end if;
  is_drawer := actor = gm.drawer;
  select word into cur from duri_private.draw_words where game_id = gm.id and n = gm.word_no;
  select coalesce(jsonb_agg(jsonb_build_object('n', n, 'word', word, 'outcome', outcome) order by n), '[]'::jsonb) into words
    from duri_private.draw_words where game_id = gm.id and (n < gm.word_no or gm.result is not null) and gm.started_at is not null;
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
    'score', gm.score,
    'passes', gm.passes,
    'wordNo', gm.word_no,
    'word', case when gm.started_at is not null and gm.result is null and is_drawer then cur else null end,
    'words', words,
    'records', recs
  );
end; $$;

revoke all on function public.start_draw_game(uuid, text, boolean), public.start_draw_game(uuid, text), public.pass_draw_word(uuid) from public, anon, authenticated;
grant execute on function public.start_draw_game(uuid, text, boolean), public.start_draw_game(uuid, text), public.pass_draw_word(uuid) to authenticated;

commit;
