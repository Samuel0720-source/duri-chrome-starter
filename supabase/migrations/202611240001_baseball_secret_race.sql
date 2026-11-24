-- Number baseball: both people can lock in their secret at the same moment.
-- Before, the second secret carried the revision from before the first one and was dropped,
-- so that person's screen stayed on "pick your number" until they tried again.
create or replace function public.baseball_action(target uuid, expected_revision integer, action text, digits text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g duri_private.baseball_games; mine integer; other integer; sc integer[]; n_me integer; n_other integer;
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(target) for update;
  if not found then raise exception 'Room unavailable'; end if;
  if (select count(*) from public.couple_members where room_id = target) <> 2 then raise exception 'Partner needed'; end if;
  select seat into mine from public.couple_members where room_id = target and user_id = auth.uid();
  other := 3 - mine;
  select * into g from duri_private.baseball_games where room_id = target for update;
  if not found then return public.baseball_state(target); end if;
  -- A secret belongs to one seat, so the partner's secret landing first must not swallow mine.
  -- Guesses still need the exact revision the screen saw.
  if action <> 'secret' and expected_revision is distinct from g.revision then return public.baseball_state(target); end if;
  if digits is null or not duri_private.baseball_valid(digits) then raise exception 'Invalid number'; end if;

  if action = 'secret' then
    -- Not in setup, or mine is already set (double tap, stale screen): nothing changes.
    if g.phase <> 'setup' or (mine = 1 and g.secret1 is not null) or (mine = 2 and g.secret2 is not null) then
      return public.baseball_state(target);
    end if;
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
