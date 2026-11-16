-- Chess (8x8): full server-validated rules (castling, en passant, promotion, checkmate,
-- stalemate, insufficient material, 50-move rule, threefold repetition).
--  * One row lock on chess_games decides every move.
--  * request_id makes retries idempotent ('duplicate').
--  * White and black swap on every new game.
begin;

create table public.chess_games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  white uuid not null references auth.users(id) on delete cascade,
  black uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'won', 'draw')),
  draw_reason text check (draw_reason is null or draw_reason in ('stalemate', 'fifty', 'material', 'repetition')),
  winner uuid references auth.users(id) on delete cascade,
  board text not null default 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR',
  turn char(1) not null default 'w' check (turn in ('w', 'b')),
  castling text not null default 'KQkq',
  ep smallint check (ep is null or ep between 0 and 63),
  halfmove integer not null default 0 check (halfmove >= 0),
  move_count integer not null default 0 check (move_count >= 0),
  last_from smallint check (last_from is null or last_from between 0 and 63),
  last_to smallint check (last_to is null or last_to between 0 and 63),
  in_check boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  check (white <> black),
  check ((status = 'won') = (winner is not null)),
  check ((status = 'draw') = (draw_reason is not null))
);
create unique index chess_one_open_per_room on public.chess_games(room_id) where status = 'open';
create index on public.chess_games(room_id, created_at desc);

create table public.chess_moves (
  game_id uuid not null references public.chess_games(id) on delete cascade,
  n integer not null check (n >= 1),
  from_sq smallint not null check (from_sq between 0 and 63),
  to_sq smallint not null check (to_sq between 0 and 63),
  promo char(1) check (promo is null or promo in ('q', 'r', 'b', 'n')),
  notation text not null,
  board_after text not null,
  pos_key text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  primary key (game_id, n),
  unique (game_id, request_id)
);
create index on public.chess_moves(game_id, pos_key);

create table public.chess_scores (
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  wins integer not null default 0,
  primary key (room_id, user_id)
);

alter table public.chess_games enable row level security;
alter table public.chess_moves enable row level security;
alter table public.chess_scores enable row level security;
revoke all on public.chess_games, public.chess_moves, public.chess_scores from public, anon, authenticated;

-- 0-indexed char access/replace helpers
create function duri_private.chess_at(b text, sq integer) returns text
language sql immutable set search_path='' as $$
  select substr(b, sq + 1, 1);
$$;

create function duri_private.chess_set(b text, sq integer, ch text) returns text
language sql immutable set search_path='' as $$
  select substr(b, 1, sq) || ch || substr(b, sq + 2);
$$;

create function duri_private.chess_color(ch text) returns char(1)
language sql immutable set search_path='' as $$
  select case
    when ascii(ch) between 65 and 90 then 'w'::char(1)
    when ascii(ch) between 97 and 122 then 'b'::char(1)
    else null
  end;
$$;

create function duri_private.chess_attacked(b text, sq integer, by_color char(1)) returns boolean
language plpgsql immutable set search_path='' as $$
declare
  r integer := sq / 8;
  c integer := sq % 8;
  pr integer;
  nr integer;
  nc integer;
  p text;
  pawn text := case when by_color = 'w' then 'P' else 'p' end;
  knight text := case when by_color = 'w' then 'N' else 'n' end;
  bishop text := case when by_color = 'w' then 'B' else 'b' end;
  rook text := case when by_color = 'w' then 'R' else 'r' end;
  queen text := case when by_color = 'w' then 'Q' else 'q' end;
  king text := case when by_color = 'w' then 'K' else 'k' end;
  d integer[];
  k_dirs integer[][] := array[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  g_dirs integer[][] := array[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  b_dirs integer[][] := array[[-1,-1],[-1,1],[1,-1],[1,1]];
  r_dirs integer[][] := array[[-1,0],[1,0],[0,-1],[0,1]];
begin
  -- Pawns
  pr := case when by_color = 'w' then r + 1 else r - 1 end;
  if pr between 0 and 7 then
    if c - 1 >= 0 and duri_private.chess_at(b, pr * 8 + c - 1) = pawn then return true; end if;
    if c + 1 <= 7 and duri_private.chess_at(b, pr * 8 + c + 1) = pawn then return true; end if;
  end if;
  -- Knights
  foreach d slice 1 in array k_dirs loop
    nr := r + d[1]; nc := c + d[2];
    if nr between 0 and 7 and nc between 0 and 7 and duri_private.chess_at(b, nr * 8 + nc) = knight then return true; end if;
  end loop;
  -- King
  foreach d slice 1 in array g_dirs loop
    nr := r + d[1]; nc := c + d[2];
    if nr between 0 and 7 and nc between 0 and 7 and duri_private.chess_at(b, nr * 8 + nc) = king then return true; end if;
  end loop;
  -- Diagonals
  foreach d slice 1 in array b_dirs loop
    nr := r + d[1]; nc := c + d[2];
    while nr between 0 and 7 and nc between 0 and 7 loop
      p := duri_private.chess_at(b, nr * 8 + nc);
      if p <> '.' then
        if p = bishop or p = queen then return true; end if;
        exit;
      end if;
      nr := nr + d[1]; nc := nc + d[2];
    end loop;
  end loop;
  -- Orthogonals
  foreach d slice 1 in array r_dirs loop
    nr := r + d[1]; nc := c + d[2];
    while nr between 0 and 7 and nc between 0 and 7 loop
      p := duri_private.chess_at(b, nr * 8 + nc);
      if p <> '.' then
        if p = rook or p = queen then return true; end if;
        exit;
      end if;
      nr := nr + d[1]; nc := nc + d[2];
    end loop;
  end loop;
  return false;
end; $$;

create function duri_private.chess_in_check(b text, col char(1)) returns boolean
language plpgsql immutable set search_path='' as $$
declare
  k integer := strpos(b, case when col = 'w' then 'K' else 'k' end) - 1;
begin
  if k < 0 then return false; end if;
  return duri_private.chess_attacked(b, k, case when col = 'w' then 'b' else 'w' end);
end; $$;

create function duri_private.chess_apply_raw(
  b text, turn char(1), castling text, ep integer, halfmove integer,
  from_sq integer, to_sq integer, promo text
) returns table(next_board text, next_turn char(1), next_castling text, next_ep integer, next_halfmove integer)
language plpgsql immutable set search_path='' as $$
declare
  piece text := duri_private.chess_at(b, from_sq);
  low text := lower(piece);
  nb text := duri_private.chess_set(b, from_sq, '.');
  nc text := castling;
  nep integer := null;
  fr integer := from_sq / 8;
  fc integer := from_sq % 8;
  tr integer := to_sq / 8;
  tc integer := to_sq % 8;
  is_cap boolean := duri_private.chess_at(b, to_sq) <> '.' or (low = 'p' and ep is not null and to_sq = ep);
  placed text := piece;
  pr text;
begin
  if low = 'p' and ep is not null and to_sq = ep then
    nb := duri_private.chess_set(nb, fr * 8 + tc, '.');
  end if;
  if low = 'k' and abs(tc - fc) = 2 then
    if tc = 6 then
      nb := duri_private.chess_set(nb, fr * 8 + 7, '.');
      nb := duri_private.chess_set(nb, fr * 8 + 5, case when turn = 'w' then 'R' else 'r' end);
    elsif tc = 2 then
      nb := duri_private.chess_set(nb, fr * 8 + 0, '.');
      nb := duri_private.chess_set(nb, fr * 8 + 3, case when turn = 'w' then 'R' else 'r' end);
    end if;
  end if;
  if low = 'p' and tr in (0, 7) then
    pr := coalesce(nullif(promo, ''), 'q');
    placed := case when turn = 'w' then upper(pr) else lower(pr) end;
  end if;
  nb := duri_private.chess_set(nb, to_sq, placed);
  if low = 'p' and abs(tr - fr) = 2 then
    nep := ((fr + tr) / 2) * 8 + fc;
  end if;
  if piece = 'K' then nc := replace(replace(nc, 'K', ''), 'Q', ''); end if;
  if piece = 'k' then nc := replace(replace(nc, 'k', ''), 'q', ''); end if;
  if from_sq = 63 or to_sq = 63 then nc := replace(nc, 'K', ''); end if;
  if from_sq = 56 or to_sq = 56 then nc := replace(nc, 'Q', ''); end if;
  if from_sq = 7 or to_sq = 7 then nc := replace(nc, 'k', ''); end if;
  if from_sq = 0 or to_sq = 0 then nc := replace(nc, 'q', ''); end if;
  return query select nb, case when turn = 'w' then 'b'::char(1) else 'w'::char(1) end, nc, nep,
    case when low = 'p' or is_cap then 0 else halfmove + 1 end;
end; $$;

create function duri_private.chess_pseudo_targets(b text, turn char(1), castling text, ep integer, from_sq integer)
returns integer[]
language plpgsql immutable set search_path='' as $$
declare
  piece text := duri_private.chess_at(b, from_sq);
  col char(1) := duri_private.chess_color(piece);
  low text := lower(piece);
  r integer := from_sq / 8;
  c integer := from_sq % 8;
  enemy char(1) := case when turn = 'w' then 'b' else 'w' end;
  res integer[] := '{}';
  dir integer;
  start_row integer;
  nr integer;
  nc integer;
  sq integer;
  tc char(1);
  d integer[];
  k_dirs integer[][] := array[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  g_dirs integer[][] := array[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  b_dirs integer[][] := array[[-1,-1],[-1,1],[1,-1],[1,1]];
  r_dirs integer[][] := array[[-1,0],[1,0],[0,-1],[0,1]];
  ray_dirs integer[][];
begin
  if col is distinct from turn then return res; end if;
  if low = 'p' then
    dir := case when turn = 'w' then -1 else 1 end;
    start_row := case when turn = 'w' then 6 else 1 end;
    nr := r + dir;
    if nr between 0 and 7 then
      sq := nr * 8 + c;
      if duri_private.chess_at(b, sq) = '.' then
        res := res || sq;
        if r = start_row then
          sq := (r + dir * 2) * 8 + c;
          if duri_private.chess_at(b, sq) = '.' then res := res || sq; end if;
        end if;
      end if;
      if c - 1 >= 0 then
        sq := nr * 8 + c - 1;
        if duri_private.chess_color(duri_private.chess_at(b, sq)) = enemy or ep = sq then res := res || sq; end if;
      end if;
      if c + 1 <= 7 then
        sq := nr * 8 + c + 1;
        if duri_private.chess_color(duri_private.chess_at(b, sq)) = enemy or ep = sq then res := res || sq; end if;
      end if;
    end if;
    return res;
  end if;
  if low = 'n' then
    foreach d slice 1 in array k_dirs loop
      nr := r + d[1]; nc := c + d[2];
      if nr between 0 and 7 and nc between 0 and 7 then
        sq := nr * 8 + nc;
        if duri_private.chess_color(duri_private.chess_at(b, sq)) is distinct from turn then res := res || sq; end if;
      end if;
    end loop;
    return res;
  end if;
  if low = 'k' then
    foreach d slice 1 in array g_dirs loop
      nr := r + d[1]; nc := c + d[2];
      if nr between 0 and 7 and nc between 0 and 7 then
        sq := nr * 8 + nc;
        if duri_private.chess_color(duri_private.chess_at(b, sq)) is distinct from turn then res := res || sq; end if;
      end if;
    end loop;
    if turn = 'w' and from_sq = 60 and not duri_private.chess_attacked(b, 60, 'b') then
      if strpos(castling, 'K') > 0 and duri_private.chess_at(b, 61) = '.' and duri_private.chess_at(b, 62) = '.'
        and duri_private.chess_at(b, 63) = 'R'
        and not duri_private.chess_attacked(b, 61, 'b') and not duri_private.chess_attacked(b, 62, 'b') then
        res := res || 62;
      end if;
      if strpos(castling, 'Q') > 0 and duri_private.chess_at(b, 59) = '.' and duri_private.chess_at(b, 58) = '.'
        and duri_private.chess_at(b, 57) = '.' and duri_private.chess_at(b, 56) = 'R'
        and not duri_private.chess_attacked(b, 59, 'b') and not duri_private.chess_attacked(b, 58, 'b') then
        res := res || 58;
      end if;
    elsif turn = 'b' and from_sq = 4 and not duri_private.chess_attacked(b, 4, 'w') then
      if strpos(castling, 'k') > 0 and duri_private.chess_at(b, 5) = '.' and duri_private.chess_at(b, 6) = '.'
        and duri_private.chess_at(b, 7) = 'r'
        and not duri_private.chess_attacked(b, 5, 'w') and not duri_private.chess_attacked(b, 6, 'w') then
        res := res || 6;
      end if;
      if strpos(castling, 'q') > 0 and duri_private.chess_at(b, 3) = '.' and duri_private.chess_at(b, 2) = '.'
        and duri_private.chess_at(b, 1) = '.' and duri_private.chess_at(b, 0) = 'r'
        and not duri_private.chess_attacked(b, 3, 'w') and not duri_private.chess_attacked(b, 2, 'w') then
        res := res || 2;
      end if;
    end if;
    return res;
  end if;
  ray_dirs := case
    when low = 'b' then b_dirs
    when low = 'r' then r_dirs
    else b_dirs || r_dirs
  end;
  foreach d slice 1 in array ray_dirs loop
    nr := r + d[1]; nc := c + d[2];
    while nr between 0 and 7 and nc between 0 and 7 loop
      sq := nr * 8 + nc;
      tc := duri_private.chess_color(duri_private.chess_at(b, sq));
      if tc is null then
        res := res || sq;
      else
        if tc = enemy then res := res || sq; end if;
        exit;
      end if;
      nr := nr + d[1]; nc := nc + d[2];
    end loop;
  end loop;
  return res;
end; $$;

create function duri_private.chess_has_legal(b text, turn char(1), castling text, ep integer) returns boolean
language plpgsql immutable set search_path='' as $$
declare
  sq integer;
  t integer;
  targets integer[];
  applied record;
begin
  for sq in 0..63 loop
    if duri_private.chess_color(duri_private.chess_at(b, sq)) = turn then
      targets := duri_private.chess_pseudo_targets(b, turn, castling, ep, sq);
      foreach t in array targets loop
        select * into applied from duri_private.chess_apply_raw(b, turn, castling, ep, 0, sq, t, 'q');
        if not duri_private.chess_in_check(applied.next_board, turn) then
          return true;
        end if;
      end loop;
    end if;
  end loop;
  return false;
end; $$;

create function duri_private.chess_insufficient(b text) returns boolean
language plpgsql immutable set search_path='' as $$
declare
  i integer;
  p text;
  low text;
  w_minors integer := 0;
  b_minors integer := 0;
  w_b_sq integer := -1;
  b_b_sq integer := -1;
begin
  for i in 0..63 loop
    p := duri_private.chess_at(b, i);
    if p in ('.', 'K', 'k') then continue; end if;
    low := lower(p);
    if low in ('p', 'r', 'q') then return false; end if;
    if duri_private.chess_color(p) = 'w' then
      w_minors := w_minors + 1;
      if low = 'b' then w_b_sq := i; end if;
    else
      b_minors := b_minors + 1;
      if low = 'b' then b_b_sq := i; end if;
    end if;
  end loop;
  if w_minors = 0 and b_minors = 0 then return true; end if;
  if w_minors + b_minors = 1 then return true; end if;
  if w_minors = 1 and b_minors = 1 and w_b_sq >= 0 and b_b_sq >= 0 then
    return (((w_b_sq / 8) + (w_b_sq % 8)) % 2) = (((b_b_sq / 8) + (b_b_sq % 8)) % 2);
  end if;
  return false;
end; $$;

create function duri_private.chess_sq_name(sq integer) returns text
language sql immutable set search_path='' as $$
  select substr('abcdefgh', (sq % 8) + 1, 1) || (8 - (sq / 8))::text;
$$;

revoke all on function
  duri_private.chess_at(text, integer),
  duri_private.chess_set(text, integer, text),
  duri_private.chess_color(text),
  duri_private.chess_attacked(text, integer, char),
  duri_private.chess_in_check(text, char),
  duri_private.chess_apply_raw(text, char, text, integer, integer, integer, integer, text),
  duri_private.chess_pseudo_targets(text, char, text, integer, integer),
  duri_private.chess_has_legal(text, char, text, integer),
  duri_private.chess_insufficient(text),
  duri_private.chess_sq_name(integer)
  from public, anon, authenticated;

-- Starts a game (or returns the open one). White swaps every game.
create function public.start_chess(target uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  partner uuid;
  gid uuid;
  last_white uuid;
  w uuid;
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  select user_id into partner from public.couple_members where room_id = target and user_id <> actor;
  if partner is null then raise exception 'Partner needed'; end if;
  select id into gid from public.chess_games where room_id = target and status = 'open';
  if found then return gid; end if;
  select white into last_white from public.chess_games where room_id = target order by created_at desc limit 1;
  w := case when last_white is null then actor when last_white = actor then partner else actor end;
  insert into public.chess_games(room_id, white, black)
    values (target, w, case when w = actor then partner else actor end)
    returning id into gid;
  return gid;
end; $$;

-- Plays one move. Returns 'ok', 'won', 'draw', or 'duplicate'.
create function public.play_chess(game uuid, from_sq integer, to_sq integer, promo text default null, req uuid default null)
returns text
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  g public.chess_games;
  expected uuid;
  piece text;
  low text;
  tr integer;
  use_promo char(1) := null;
  targets integer[];
  applied record;
  opp_check boolean;
  opp_legal boolean;
  next_status text := 'open';
  next_reason text := null;
  pkey text;
  repeats integer;
  is_cap boolean;
  files text := 'abcdefgh';
  note text;
  suffix text := '';
begin
  if from_sq is null or to_sq is null or from_sq not between 0 and 63 or to_sq not between 0 and 63 or req is null then
    raise exception 'Invalid move';
  end if;
  if promo is not null and promo not in ('q', 'r', 'b', 'n') then
    raise exception 'Invalid move';
  end if;
  select * into g from public.chess_games where id = game for update;
  if not found or not duri_private.is_member(g.room_id) then raise exception 'Room unavailable'; end if;
  perform 1 from public.couple_rooms where id = g.room_id and closed_at is null;
  if not found then raise exception 'Room unavailable'; end if;
  if exists (select 1 from public.chess_moves where game_id = game and request_id = req) then return 'duplicate'; end if;
  if g.status <> 'open' then raise exception 'Game over'; end if;
  expected := case when g.turn = 'w' then g.white else g.black end;
  if actor <> expected then raise exception 'Not your turn'; end if;

  piece := duri_private.chess_at(g.board, from_sq);
  low := lower(piece);
  if duri_private.chess_color(piece) is distinct from g.turn then raise exception 'Invalid move'; end if;

  targets := duri_private.chess_pseudo_targets(g.board, g.turn, g.castling, g.ep, from_sq);
  if not (to_sq = any(targets)) then raise exception 'Invalid move'; end if;

  tr := to_sq / 8;
  if low = 'p' and tr in (0, 7) then
    use_promo := coalesce(promo, 'q')::char(1);
  end if;

  select * into applied from duri_private.chess_apply_raw(g.board, g.turn, g.castling, g.ep, g.halfmove, from_sq, to_sq, use_promo);
  if duri_private.chess_in_check(applied.next_board, g.turn) then
    raise exception 'Invalid move';
  end if;

  opp_check := duri_private.chess_in_check(applied.next_board, applied.next_turn);
  opp_legal := duri_private.chess_has_legal(applied.next_board, applied.next_turn, applied.next_castling, applied.next_ep);
  pkey := applied.next_board || ':' || applied.next_turn || ':' || applied.next_castling || ':' || coalesce(applied.next_ep::text, '-');

  if not opp_legal then
    if opp_check then
      next_status := 'won';
      suffix := '#';
    else
      next_status := 'draw';
      next_reason := 'stalemate';
    end if;
  elsif duri_private.chess_insufficient(applied.next_board) then
    next_status := 'draw';
    next_reason := 'material';
  elsif applied.next_halfmove >= 100 then
    next_status := 'draw';
    next_reason := 'fifty';
  else
    select count(*) into repeats from public.chess_moves where game_id = game and pos_key = pkey;
    -- Starting position counts as 1 occurrence if pkey matches initial position.
    if pkey = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR:w:KQkq:-' then
      repeats := repeats + 1;
    end if;
    if repeats >= 2 then
      next_status := 'draw';
      next_reason := 'repetition';
    end if;
  end if;

  if next_status = 'open' and opp_check then suffix := '+'; end if;

  is_cap := duri_private.chess_at(g.board, to_sq) <> '.' or (low = 'p' and g.ep is not null and to_sq = g.ep);
  if low = 'k' and abs((to_sq % 8) - (from_sq % 8)) = 2 then
    note := (case when (to_sq % 8) = 6 then 'O-O' else 'O-O-O' end) || suffix;
  elsif low = 'p' then
    note := (case when is_cap then substr(files, (from_sq % 8) + 1, 1) || 'x' else '' end)
      || duri_private.chess_sq_name(to_sq)
      || (case when use_promo is not null then '=' || upper(use_promo) else '' end)
      || suffix;
  else
    note := upper(low) || duri_private.chess_sq_name(from_sq)
      || (case when is_cap then 'x' else '' end)
      || duri_private.chess_sq_name(to_sq) || suffix;
  end if;

  insert into public.chess_moves(game_id, n, from_sq, to_sq, promo, notation, board_after, pos_key, user_id, request_id)
    values (game, g.move_count + 1, from_sq, to_sq, use_promo, note, applied.next_board, pkey, actor, req);

  update public.chess_games set
    board = applied.next_board,
    turn = applied.next_turn,
    castling = applied.next_castling,
    ep = applied.next_ep,
    halfmove = applied.next_halfmove,
    move_count = move_count + 1,
    last_from = from_sq,
    last_to = to_sq,
    in_check = opp_check,
    status = next_status,
    draw_reason = next_reason,
    winner = case when next_status = 'won' then actor else null end,
    finished_at = case when next_status <> 'open' then clock_timestamp() else null end
  where id = game;

  if next_status = 'won' then
    insert into public.chess_scores(room_id, user_id, wins) values (g.room_id, actor, 1)
      on conflict (room_id, user_id) do update set wins = public.chess_scores.wins + 1;
    return 'won';
  elsif next_status = 'draw' then
    return 'draw';
  end if;
  return 'ok';
end; $$;

create function public.resign_chess(game uuid) returns text
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  g public.chess_games;
  other uuid;
begin
  select * into g from public.chess_games where id = game for update;
  if not found or not duri_private.is_member(g.room_id) or actor not in (g.white, g.black) then
    raise exception 'Room unavailable';
  end if;
  if g.status <> 'open' then return 'closed'; end if;
  other := case when actor = g.white then g.black else g.white end;
  update public.chess_games set status = 'won', winner = other, finished_at = clock_timestamp() where id = game;
  insert into public.chess_scores(room_id, user_id, wins) values (g.room_id, other, 1)
    on conflict (room_id, user_id) do update set wins = public.chess_scores.wins + 1;
  return 'ok';
end; $$;

create function public.chess_state(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  g public.chess_games;
  mine integer;
  theirs integer;
  ties integer;
  mv jsonb;
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
  select coalesce(max(wins) filter (where user_id = actor), 0),
         coalesce(max(wins) filter (where user_id <> actor), 0)
    into mine, theirs from public.chess_scores where room_id = target;
  select count(*) into ties from public.chess_games where room_id = target and status = 'draw';
  select * into g from public.chess_games where room_id = target order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('game', null, 'myWins', mine, 'partnerWins', theirs, 'draws', ties);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'n', n, 'from', from_sq, 'to', to_sq, 'promo', promo, 'notation', notation, 'boardAfter', board_after
  ) order by n), '[]'::jsonb)
    into mv from public.chess_moves where game_id = g.id;
  return jsonb_build_object(
    'game', g.id,
    'status', g.status,
    'drawReason', g.draw_reason,
    'me', case when g.white = actor then 'white' else 'black' end,
    'turn', case when g.status <> 'open' then null
                 when (g.turn = 'w') = (g.white = actor) then 'me' else 'partner' end,
    'winner', case when g.winner is null then null when g.winner = actor then 'me' else 'partner' end,
    'board', g.board,
    'castling', g.castling,
    'ep', g.ep,
    'halfmove', g.halfmove,
    'inCheck', g.in_check,
    'lastMove', case when g.last_from is not null and g.last_to is not null
                     then jsonb_build_object('from', g.last_from, 'to', g.last_to) else null end,
    'moves', mv,
    'myWins', mine,
    'partnerWins', theirs,
    'draws', ties
  );
end; $$;

revoke all on function
  public.start_chess(uuid),
  public.play_chess(uuid, integer, integer, text, uuid),
  public.resign_chess(uuid),
  public.chess_state(uuid)
  from public, anon, authenticated;

grant execute on function
  public.start_chess(uuid),
  public.play_chess(uuid, integer, integer, text, uuid),
  public.resign_chess(uuid),
  public.chess_state(uuid)
  to authenticated;

create trigger chess_games_notify after insert or update on public.chess_games
  for each row execute function duri_private.broadcast_room_event('chess');

create function duri_private.chess_move_notify() returns trigger
language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
  select room_id into rid from public.chess_games where id = new.game_id;
  perform realtime.send(jsonb_build_object('change', 'chess'), 'chess', 'room:' || rid::text, true);
  return null;
end; $$;
revoke all on function duri_private.chess_move_notify() from public, anon, authenticated;
create trigger chess_moves_notify after insert on public.chess_moves
  for each row execute function duri_private.chess_move_notify();

commit;
