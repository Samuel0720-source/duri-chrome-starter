-- P6-1: 1:1 오목 (15x15, free rules: five OR MORE in a row wins, a full board is a draw).
--  * One lock on the game row decides every move, so two taps at the same instant cannot both land.
--  * Turn order, the free cell check and the win check all happen here, never in the browser.
--  * A move carries a request id: a resent tap is answered 'duplicate' and places nothing.
--  * The first move of the next game belongs to the other player (black swaps every game).
--  * Realtime carries only the word 'gomoku'; browsers re-read gomoku_state().
begin;

create table public.gomoku_games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  black uuid not null references auth.users(id) on delete cascade,
  white uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'won', 'draw')),
  winner uuid references auth.users(id) on delete cascade,
  win_line jsonb,
  move_count integer not null default 0 check (move_count between 0 and 225),
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  check (black <> white),
  check ((status = 'won') = (winner is not null))
);
create unique index gomoku_one_open_per_room on public.gomoku_games(room_id) where status = 'open';

create table public.gomoku_moves (
  game_id uuid not null references public.gomoku_games(id) on delete cascade,
  n integer not null check (n between 1 and 225),
  x smallint not null check (x between 0 and 14),
  y smallint not null check (y between 0 and 14),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  primary key (game_id, n),
  unique (game_id, x, y),
  unique (game_id, request_id)
);

create table public.gomoku_scores (
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  wins integer not null default 0,
  primary key (room_id, user_id)
);

alter table public.gomoku_games enable row level security;
alter table public.gomoku_moves enable row level security;
alter table public.gomoku_scores enable row level security;
revoke all on public.gomoku_games, public.gomoku_moves, public.gomoku_scores from public, anon, authenticated;

-- Starts a game (or returns the one already open). Black = the player who was white last time; the very first game: whoever starts.
create function public.start_gomoku(target uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); partner uuid; gid uuid; last_black uuid; b uuid;
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  select user_id into partner from public.couple_members where room_id = target and user_id <> actor;
  if partner is null then raise exception 'Partner needed'; end if;
  select id into gid from public.gomoku_games where room_id = target and status = 'open';
  if found then return gid; end if;
  select black into last_black from public.gomoku_games where room_id = target order by created_at desc limit 1;
  b := case when last_black is null then actor when last_black = actor then partner else actor end;
  insert into public.gomoku_games(room_id, black, white) values (target, b, case when b = actor then partner else actor end)
    returning id into gid;
  return gid;
end; $$;

-- Counts same-colour stones through (px,py) along one direction; returns the cells of the line.
create function duri_private.gomoku_line(gid uuid, who uuid, px integer, py integer, dx integer, dy integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pts jsonb := jsonb_build_array(jsonb_build_array(px, py)); cx integer; cy integer;
begin
  cx := px + dx; cy := py + dy;
  while cx between 0 and 14 and cy between 0 and 14
    and exists (select 1 from public.gomoku_moves m where m.game_id = gid and m.x = cx and m.y = cy and m.user_id = who) loop
    pts := pts || jsonb_build_array(jsonb_build_array(cx, cy)); cx := cx + dx; cy := cy + dy;
  end loop;
  cx := px - dx; cy := py - dy;
  while cx between 0 and 14 and cy between 0 and 14
    and exists (select 1 from public.gomoku_moves m where m.game_id = gid and m.x = cx and m.y = cy and m.user_id = who) loop
    pts := jsonb_build_array(jsonb_build_array(cx, cy)) || pts; cx := cx - dx; cy := cy - dy;
  end loop;
  return pts;
end; $$;
revoke all on function duri_private.gomoku_line(uuid, uuid, integer, integer, integer, integer) from public, anon, authenticated;

-- One stone. Returns 'ok', 'won', 'draw' or 'duplicate'.
create function public.play_gomoku(game uuid, px integer, py integer, req uuid) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); g public.gomoku_games; expected uuid; line jsonb; best jsonb; d integer[]; dirs integer[][] := array[[1,0],[0,1],[1,1],[1,-1]];
begin
  if px is null or py is null or px not between 0 and 14 or py not between 0 and 14 or req is null then raise exception 'Invalid move'; end if;
  select * into g from public.gomoku_games where id = game for update;
  if not found or not duri_private.is_member(g.room_id) then raise exception 'Room unavailable'; end if;
  perform 1 from public.couple_rooms where id = g.room_id and closed_at is null;
  if not found then raise exception 'Room unavailable'; end if;
  if exists (select 1 from public.gomoku_moves where game_id = game and request_id = req) then return 'duplicate'; end if;
  if g.status <> 'open' then raise exception 'Game over'; end if;
  expected := case when g.move_count % 2 = 0 then g.black else g.white end;
  if actor <> expected then raise exception 'Not your turn'; end if;
  if exists (select 1 from public.gomoku_moves where game_id = game and x = px and y = py) then raise exception 'Occupied'; end if;
  insert into public.gomoku_moves(game_id, n, x, y, user_id, request_id) values (game, g.move_count + 1, px, py, actor, req);
  update public.gomoku_games set move_count = move_count + 1 where id = game;
  best := null;
  foreach d slice 1 in array dirs loop
    line := duri_private.gomoku_line(game, actor, px, py, d[1], d[2]);
    if jsonb_array_length(line) >= 5 and (best is null or jsonb_array_length(line) > jsonb_array_length(best)) then best := line; end if;
  end loop;
  if best is not null then
    update public.gomoku_games set status = 'won', winner = actor, win_line = best, finished_at = clock_timestamp() where id = game;
    insert into public.gomoku_scores(room_id, user_id, wins) values (g.room_id, actor, 1)
      on conflict (room_id, user_id) do update set wins = public.gomoku_scores.wins + 1;
    return 'won';
  end if;
  if g.move_count + 1 = 225 then
    update public.gomoku_games set status = 'draw', finished_at = clock_timestamp() where id = game;
    return 'draw';
  end if;
  return 'ok';
end; $$;

-- Giving up: the other player wins this game.
create function public.resign_gomoku(game uuid) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); g public.gomoku_games; other uuid;
begin
  select * into g from public.gomoku_games where id = game for update;
  if not found or not duri_private.is_member(g.room_id) or actor not in (g.black, g.white) then raise exception 'Room unavailable'; end if;
  if g.status <> 'open' then return 'closed'; end if;
  other := case when actor = g.black then g.white else g.black end;
  update public.gomoku_games set status = 'won', winner = other, finished_at = clock_timestamp() where id = game;
  insert into public.gomoku_scores(room_id, user_id, wins) values (g.room_id, other, 1)
    on conflict (room_id, user_id) do update set wins = public.gomoku_scores.wins + 1;
  return 'ok';
end; $$;

create function public.gomoku_state(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); g public.gomoku_games; mine integer; theirs integer; ties integer; mv jsonb;
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
  select coalesce(max(wins) filter (where user_id = actor), 0), coalesce(max(wins) filter (where user_id <> actor), 0)
    into mine, theirs from public.gomoku_scores where room_id = target;
  select count(*) into ties from public.gomoku_games where room_id = target and status = 'draw';
  select * into g from public.gomoku_games where room_id = target order by created_at desc limit 1;
  if not found then
    return jsonb_build_object('game', null, 'myWins', mine, 'partnerWins', theirs, 'draws', ties);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('n', n, 'x', x, 'y', y, 'by', case when user_id = actor then 'me' else 'partner' end) order by n), '[]'::jsonb)
    into mv from public.gomoku_moves where game_id = g.id;
  return jsonb_build_object(
    'game', g.id,
    'status', g.status,
    'me', case when g.black = actor then 'black' else 'white' end,
    'turn', case when g.status <> 'open' then null
                 when (g.move_count % 2 = 0) = (g.black = actor) then 'me' else 'partner' end,
    'winner', case when g.winner is null then null when g.winner = actor then 'me' else 'partner' end,
    'winLine', g.win_line,
    'moves', mv,
    'myWins', mine, 'partnerWins', theirs, 'draws', ties
  );
end; $$;

revoke all on function public.start_gomoku(uuid), public.play_gomoku(uuid, integer, integer, uuid), public.resign_gomoku(uuid), public.gomoku_state(uuid)
  from public, anon, authenticated;
grant execute on function public.start_gomoku(uuid), public.play_gomoku(uuid, integer, integer, uuid), public.resign_gomoku(uuid), public.gomoku_state(uuid)
  to authenticated;

create trigger gomoku_games_notify after insert or update on public.gomoku_games
  for each row execute function duri_private.broadcast_room_event('gomoku');
create function duri_private.gomoku_move_notify() returns trigger
language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
  select room_id into rid from public.gomoku_games where id = new.game_id;
  perform realtime.send(jsonb_build_object('change', 'gomoku'), 'gomoku', 'room:' || rid::text, true);
  return null;
end; $$;
revoke all on function duri_private.gomoku_move_notify() from public, anon, authenticated;
create trigger gomoku_moves_notify after insert on public.gomoku_moves
  for each row execute function duri_private.gomoku_move_notify();

commit;
