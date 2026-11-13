-- P6-3: "상대 선택 맞히기" now draws from 120 questions (src/core/guess.ts).
-- Each new game takes the three questions this room has not seen for the longest time
-- (never seen first, ties broken at random), so no question repeats until all 120 were played.
begin;

create or replace function public.start_guess_game(target uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare gid uuid; picks smallint[];
begin
  perform 1 from public.couple_rooms where id=target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  if (select count(*) from public.couple_members where room_id=target) < 2 then raise exception 'Partner needed'; end if;
  select id into gid from public.guess_games where room_id=target and finished_at is null;
  if found then return gid; end if;
  select array_agg(q) into picks from (
    select b.q::smallint as q
    from generate_series(0, 119) b(q)
    left join lateral (
      select max(g.created_at) as last_seen
      from public.guess_games g where g.room_id = target and b.q = any(g.questions)
    ) seen on true
    order by seen.last_seen nulls first, random()
    limit 3) s;
  insert into public.guess_games(room_id, questions) values(target, picks) returning id into gid;
  return gid;
end; $$;

commit;
