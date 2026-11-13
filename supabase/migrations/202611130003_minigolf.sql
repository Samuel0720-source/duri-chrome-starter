-- P6-2: 동시 미니골프. Two players, one course, two separate balls that hit at the same time.
--  * One shot = one request. The database simulates the whole roll once (fixed physics, no 60 fps loop),
--    stores the path, and both browsers replay that same path. Nothing is simulated in the browser.
--  * Balls pass through each other; walls and blocks bounce them. Each player can only hit their own resting ball.
--  * A resent shot id returns the stored shot. A second shot while the ball is still rolling is refused (DB clock).
--  * When both balls are in the cup and the last replay has finished, the next hole starts (or the game ends).
--  * Realtime carries only the word 'golf'; browsers re-read golf_state().
begin;

create table public.golf_games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  holes integer not null check (holes in (1, 3)),
  hole integer not null default 1 check (hole between 1 and 3),
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  created_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  check (hole <= holes)
);
create unique index golf_one_open_per_room on public.golf_games(room_id) where status = 'open';

create table public.golf_balls (
  game_id uuid not null references public.golf_games(id) on delete cascade,
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  x double precision not null,
  y double precision not null,
  strokes integer not null default 0 check (strokes between 0 and 10),
  total integer not null default 0,
  holed boolean not null default false,
  shot_no integer not null default 0,
  shot_started timestamptz,
  moving_until timestamptz not null default clock_timestamp(),
  path jsonb,
  primary key (game_id, user_id)
);

create table public.golf_shots (
  game_id uuid not null references public.golf_games(id) on delete cascade,
  shot_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  hole integer not null,
  n integer not null,
  angle double precision not null,
  power double precision not null,
  physics integer not null default 1,
  path jsonb not null,
  holed boolean not null,
  duration_ms integer not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (game_id, shot_id)
);

create table public.golf_records (
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  holes integer not null check (holes in (1, 3)),
  best integer not null,
  primary key (room_id, holes)
);

alter table public.golf_games enable row level security;
alter table public.golf_balls enable row level security;
alter table public.golf_shots enable row level security;
alter table public.golf_records enable row level security;
revoke all on public.golf_games, public.golf_balls, public.golf_shots, public.golf_records from public, anon, authenticated;

-- ---------------------------------------------------------------- courses (1000 x 600, ball radius 12, cup radius 22)
create function duri_private.golf_rect(x1 numeric, y1 numeric, x2 numeric, y2 numeric) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_array(
    jsonb_build_array(x1, y1, x2, y1), jsonb_build_array(x2, y1, x2, y2),
    jsonb_build_array(x2, y2, x1, y2), jsonb_build_array(x1, y2, x1, y1));
$$;

create function duri_private.golf_course(h integer) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object(
    'w', 1000, 'h', 600, 'ball', 12,
    'tee', case h when 1 then jsonb_build_array(120, 300) when 2 then jsonb_build_array(100, 520) else jsonb_build_array(100, 300) end,
    'cup', case h when 1 then jsonb_build_object('x', 880, 'y', 300, 'r', 22)
                  when 2 then jsonb_build_object('x', 150, 'y', 100, 'r', 22)
                  else jsonb_build_object('x', 900, 'y', 300, 'r', 22) end,
    'walls', duri_private.golf_rect(0, 0, 1000, 600)
      || case h
           when 1 then duri_private.golf_rect(460, 180, 540, 420)
           when 2 then jsonb_build_array(jsonb_build_array(0, 360, 700, 360), jsonb_build_array(300, 200, 1000, 200))
           else duri_private.golf_rect(350, 100, 420, 360) || duri_private.golf_rect(600, 240, 670, 500)
         end);
$$;

-- ---------------------------------------------------------------- physics v1
-- Fixed time step (1/60 s), 3 sub-steps per step (never more than 9.4 px per sub-step, less than the ball radius,
-- so nothing tunnels through a wall), friction 0.985 per step, bounce keeps 75% of the speed.
-- The ball drops in only when it is over the cup slower than 14 px per step; faster, it rolls over.
create function duri_private.golf_simulate(hole integer, x0 double precision, y0 double precision, ang double precision, pw double precision) returns jsonb
language plpgsql stable set search_path='' as $$
declare
  c jsonb := duri_private.golf_course(hole);
  segs double precision[]; n integer := jsonb_array_length(c->'walls'); i integer; j integer; k integer;
  px double precision := x0; py double precision := y0;
  vx double precision := cos(ang) * pw * 28; vy double precision := sin(ang) * pw * 28;
  r constant double precision := 12;
  cx double precision := (c->'cup'->>'x')::double precision; cy double precision := (c->'cup'->>'y')::double precision;
  cr double precision := (c->'cup'->>'r')::double precision;
  ax double precision; ay double precision; ex double precision; ey double precision; l2 double precision;
  u double precision; qx double precision; qy double precision; dx double precision; dy double precision;
  d2 double precision; d double precision; nx double precision; ny double precision; dot double precision;
  t integer := 0; holed boolean := false; path jsonb := jsonb_build_array(jsonb_build_array(round(x0::numeric, 1), round(y0::numeric, 1)));
begin
  for i in 0 .. n - 1 loop
    for j in 0 .. 3 loop segs[i * 4 + j + 1] := (c->'walls'->i->>j)::double precision; end loop;
  end loop;
  while t < 500 loop
    t := t + 1;
    for j in 1 .. 3 loop
      px := px + vx / 3; py := py + vy / 3;
      for k in 0 .. n - 1 loop
        ax := segs[k * 4 + 1]; ay := segs[k * 4 + 2];
        ex := segs[k * 4 + 3] - ax; ey := segs[k * 4 + 4] - ay; l2 := ex * ex + ey * ey;
        u := greatest(0, least(1, ((px - ax) * ex + (py - ay) * ey) / l2));
        qx := ax + u * ex; qy := ay + u * ey;
        dx := px - qx; dy := py - qy; d2 := dx * dx + dy * dy;
        if d2 < r * r then
          d := sqrt(d2);
          if d < 1e-9 then nx := -ey / sqrt(l2); ny := ex / sqrt(l2); else nx := dx / d; ny := dy / d; end if;
          px := qx + nx * r; py := qy + ny * r;
          dot := vx * nx + vy * ny;
          if dot < 0 then vx := vx - 1.75 * dot * nx; vy := vy - 1.75 * dot * ny; end if;
        end if;
      end loop;
      if (px - cx) * (px - cx) + (py - cy) * (py - cy) < cr * cr and sqrt(vx * vx + vy * vy) < 14 then
        holed := true; px := cx; py := cy; exit;
      end if;
    end loop;
    exit when holed;
    vx := vx * 0.985; vy := vy * 0.985;
    if t % 3 = 0 then path := path || jsonb_build_array(jsonb_build_array(round(px::numeric, 1), round(py::numeric, 1))); end if;
    if vx * vx + vy * vy < 0.04 then exit; end if;
  end loop;
  path := path || jsonb_build_array(jsonb_build_array(round(px::numeric, 1), round(py::numeric, 1)));
  return jsonb_build_object('path', path, 'x', px, 'y', py, 'holed', holed, 'ms', round(t * 1000 / 60.0)::integer);
end; $$;
revoke all on function duri_private.golf_rect(numeric, numeric, numeric, numeric), duri_private.golf_course(integer),
  duri_private.golf_simulate(integer, double precision, double precision, double precision, double precision) from public, anon, authenticated;

-- When both balls are in the cup and the last roll has finished: next hole, or the end of the game.
create function duri_private.advance_golf(gid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare g public.golf_games; tee jsonb; sum_total integer;
begin
  select * into g from public.golf_games where id = gid for update;
  if not found or g.status <> 'open' then return; end if;
  if (select count(*) from public.golf_balls where game_id = gid) <> 2 then return; end if;
  if exists (select 1 from public.golf_balls where game_id = gid and (not holed or moving_until > clock_timestamp())) then return; end if;
  update public.golf_balls set total = total + strokes where game_id = gid;
  if g.hole < g.holes then
    tee := duri_private.golf_course(g.hole + 1)->'tee';
    update public.golf_games set hole = hole + 1 where id = gid;
    update public.golf_balls set x = (tee->>0)::double precision, y = (tee->>1)::double precision, strokes = 0, holed = false,
      path = null, shot_started = null, moving_until = clock_timestamp() where game_id = gid;
  else
    update public.golf_games set status = 'done', finished_at = clock_timestamp() where id = gid;
    select sum(total) into sum_total from public.golf_balls where game_id = gid;
    insert into public.golf_records(room_id, holes, best) values (g.room_id, g.holes, sum_total)
      on conflict (room_id, holes) do update set best = least(public.golf_records.best, excluded.best);
  end if;
end; $$;
revoke all on function duri_private.advance_golf(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- functions
create function public.start_golf(target uuid, hole_count integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); partner uuid; gid uuid; tee jsonb := duri_private.golf_course(1)->'tee';
begin
  if hole_count is null or hole_count not in (1, 3) then raise exception 'Invalid course'; end if;
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  select user_id into partner from public.couple_members where room_id = target and user_id <> actor;
  if partner is null then raise exception 'Partner needed'; end if;
  select id into gid from public.golf_games where room_id = target and status = 'open';
  if found then perform duri_private.advance_golf(gid); end if;
  select id into gid from public.golf_games where room_id = target and status = 'open';
  if found then return gid; end if;
  insert into public.golf_games(room_id, holes) values (target, hole_count) returning id into gid;
  insert into public.golf_balls(game_id, room_id, user_id, x, y)
    select gid, target, m.user_id, (tee->>0)::double precision, (tee->>1)::double precision from public.couple_members m where m.room_id = target;
  return gid;
end; $$;

-- Ends a game nobody wants to finish (no record).
create function public.cancel_golf(game uuid) returns void
language plpgsql security definer set search_path='' as $$
declare g public.golf_games;
begin
  select * into g from public.golf_games where id = game for update;
  if not found or not duri_private.is_member(g.room_id) then raise exception 'Room unavailable'; end if;
  if g.status = 'open' then update public.golf_games set status = 'cancelled', finished_at = clock_timestamp() where id = game; end if;
end; $$;

-- One hit. angle in radians, power 0.02 .. 1. Returns {status:'ok'|'duplicate', shot:{...}}.
create function public.golf_shot(game uuid, shot uuid, angle double precision, power double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); g public.golf_games; b public.golf_balls; old public.golf_shots; sim jsonb; stroke_n integer; done boolean; started timestamptz := clock_timestamp();
begin
  if shot is null or angle is null or power is null or angle <> angle or power <> power or abs(angle) > 100 or power < 0.02 or power > 1 then
    raise exception 'Invalid shot';
  end if;
  select * into g from public.golf_games where id = game for update;
  if not found or not duri_private.is_member(g.room_id) then raise exception 'Room unavailable'; end if;
  perform 1 from public.couple_rooms where id = g.room_id and closed_at is null;
  if not found then raise exception 'Room unavailable'; end if;
  select * into old from public.golf_shots where game_id = game and shot_id = shot;
  if found then
    return jsonb_build_object('status', 'duplicate', 'n', old.n, 'holed', old.holed, 'path', old.path, 'ms', old.duration_ms);
  end if;
  if g.status <> 'open' then raise exception 'Game over'; end if;
  perform duri_private.advance_golf(game);
  select * into g from public.golf_games where id = game;
  if g.status <> 'open' then raise exception 'Game over'; end if;
  select * into b from public.golf_balls where game_id = game and user_id = actor for update;
  if not found then raise exception 'Room unavailable'; end if;
  if b.holed then raise exception 'Already in the cup'; end if;
  if b.moving_until > started then raise exception 'Ball moving'; end if;
  sim := duri_private.golf_simulate(g.hole, b.x, b.y, angle, power);
  stroke_n := b.strokes + 1;
  done := (sim->>'holed')::boolean or stroke_n >= 10;
  insert into public.golf_shots(game_id, shot_id, user_id, hole, n, angle, power, path, holed, duration_ms)
    values (game, shot, actor, g.hole, stroke_n, angle, power, sim->'path', (sim->>'holed')::boolean, (sim->>'ms')::integer);
  update public.golf_balls set x = (sim->>'x')::double precision, y = (sim->>'y')::double precision, strokes = stroke_n,
    holed = done, shot_no = shot_no + 1, shot_started = started, path = sim->'path',
    moving_until = started + ((sim->>'ms')::integer || ' milliseconds')::interval
    where game_id = game and user_id = actor;
  return jsonb_build_object('status', 'ok', 'n', stroke_n, 'holed', done, 'path', sim->'path', 'ms', (sim->>'ms')::integer);
end; $$;

create function public.golf_state(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); g public.golf_games; best jsonb; me jsonb; pa jsonb;
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
  select * into g from public.golf_games where room_id = target order by created_at desc limit 1;
  if found and g.status = 'open' then perform duri_private.advance_golf(g.id); select * into g from public.golf_games where id = g.id; end if;
  select coalesce(jsonb_object_agg(holes::text, r.best), '{}'::jsonb) into best from public.golf_records r where r.room_id = target;
  if g.id is null then return jsonb_build_object('game', null, 'best', best, 'nowMs', (extract(epoch from clock_timestamp()) * 1000)::bigint); end if;
  select jsonb_build_object('x', b.x, 'y', b.y, 'strokes', b.strokes, 'total', b.total, 'holed', b.holed, 'shotNo', b.shot_no,
      'startedMs', (extract(epoch from b.shot_started) * 1000)::bigint, 'untilMs', (extract(epoch from b.moving_until) * 1000)::bigint, 'path', b.path)
    into me from public.golf_balls b where b.game_id = g.id and b.user_id = actor;
  select jsonb_build_object('x', b.x, 'y', b.y, 'strokes', b.strokes, 'total', b.total, 'holed', b.holed, 'shotNo', b.shot_no,
      'startedMs', (extract(epoch from b.shot_started) * 1000)::bigint, 'untilMs', (extract(epoch from b.moving_until) * 1000)::bigint, 'path', b.path)
    into pa from public.golf_balls b where b.game_id = g.id and b.user_id <> actor;
  return jsonb_build_object('game', g.id, 'holes', g.holes, 'hole', g.hole, 'status', g.status,
    'course', duri_private.golf_course(g.hole), 'me', me, 'partner', pa, 'best', best,
    'nowMs', (extract(epoch from clock_timestamp()) * 1000)::bigint);
end; $$;

revoke all on function public.start_golf(uuid, integer), public.cancel_golf(uuid), public.golf_shot(uuid, uuid, double precision, double precision),
  public.golf_state(uuid) from public, anon, authenticated;
grant execute on function public.start_golf(uuid, integer), public.cancel_golf(uuid), public.golf_shot(uuid, uuid, double precision, double precision),
  public.golf_state(uuid) to authenticated;

create trigger golf_games_notify after insert or update on public.golf_games
  for each row execute function duri_private.broadcast_room_event('golf');
create trigger golf_balls_notify after update on public.golf_balls
  for each row execute function duri_private.broadcast_room_event('golf');

commit;
