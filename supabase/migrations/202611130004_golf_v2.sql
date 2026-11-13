-- P6-2b: 미니골프 2판.
--  * Courses of 3, 6 or 9 holes (was 1 or 3). Old test games and records are cleared.
--  * Harder holes: sand (slows the ball a lot) and water (the ball goes back where it was hit from, +1 penalty stroke).
--  * The path is stored every tick (1/60 s) instead of every third tick, so the replay is smooth at bounces.
--  * golf_shot returns startedMs / untilMs so the player who hit can start the replay without a second request.
begin;

delete from public.golf_games;
delete from public.golf_records;
alter table public.golf_games drop constraint golf_games_holes_check;
alter table public.golf_games drop constraint golf_games_hole_check;
alter table public.golf_games add constraint golf_games_holes_check check (holes in (3, 6, 9));
alter table public.golf_games add constraint golf_games_hole_check check (hole between 1 and 9);
alter table public.golf_records drop constraint golf_records_holes_check;
alter table public.golf_records add constraint golf_records_holes_check check (holes in (3, 6, 9));
alter table public.golf_balls add column water boolean not null default false;
alter table public.golf_shots add column water boolean not null default false;

-- A diamond bumper: four walls around a centre.
create function duri_private.golf_diamond(cx numeric, cy numeric, r numeric) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_array(
    jsonb_build_array(cx, cy - r, cx + r, cy), jsonb_build_array(cx + r, cy, cx, cy + r),
    jsonb_build_array(cx, cy + r, cx - r, cy), jsonb_build_array(cx - r, cy, cx, cy - r));
$$;
revoke all on function duri_private.golf_diamond(numeric, numeric, numeric) from public, anon, authenticated;

-- Nine holes on a 1000 x 600 field. walls: segments [x1,y1,x2,y2]; sand / water: rectangles [x1,y1,x2,y2].
-- The outer fence is added once at the end.
create or replace function duri_private.golf_course(h integer) returns jsonb
language sql immutable set search_path='' as $$
  select jsonb_build_object('w', 1000, 'h', 600, 'ball', 12, 'n', h) || o
    || jsonb_build_object('walls', duri_private.golf_rect(0, 0, 1000, 600) || (o->'walls'))
  from (select
    case h
    when 1 then jsonb_build_object('name', '몸풀기',
      'tee', jsonb_build_array(110, 300), 'cup', jsonb_build_object('x', 880, 'y', 300, 'r', 22),
      'walls', duri_private.golf_rect(450, 170, 530, 430),
      'sand', jsonb_build_array(jsonb_build_array(640, 400, 790, 540), jsonb_build_array(640, 60, 790, 200)),
      'water', '[]'::jsonb)
    when 2 then jsonb_build_object('name', 'S자 길',
      'tee', jsonb_build_array(90, 520), 'cup', jsonb_build_object('x', 140, 'y', 90, 'r', 22),
      'walls', jsonb_build_array(jsonb_build_array(0, 380, 720, 380), jsonb_build_array(280, 200, 1000, 200)),
      'sand', jsonb_build_array(jsonb_build_array(820, 230, 1000, 350)),
      'water', jsonb_build_array(jsonb_build_array(400, 480, 560, 600)))
    when 3 then jsonb_build_object('name', '두 개의 벽',
      'tee', jsonb_build_array(90, 300), 'cup', jsonb_build_object('x', 910, 'y', 300, 'r', 22),
      'walls', duri_private.golf_rect(330, 90, 400, 370) || duri_private.golf_rect(610, 230, 680, 510),
      'sand', jsonb_build_array(jsonb_build_array(760, 380, 900, 600)),
      'water', jsonb_build_array(jsonb_build_array(440, 0, 570, 130)))
    when 4 then jsonb_build_object('name', '호수 건너기',
      'tee', jsonb_build_array(90, 300), 'cup', jsonb_build_object('x', 910, 'y', 300, 'r', 22),
      'walls', jsonb_build_array(jsonb_build_array(250, 220, 250, 380)),
      'sand', jsonb_build_array(jsonb_build_array(700, 0, 780, 90), jsonb_build_array(700, 510, 780, 600)),
      'water', jsonb_build_array(jsonb_build_array(340, 90, 660, 510)))
    when 5 then jsonb_build_object('name', '지그재그',
      'tee', jsonb_build_array(90, 90), 'cup', jsonb_build_object('x', 915, 'y', 515, 'r', 22),
      'walls', jsonb_build_array(jsonb_build_array(250, 0, 250, 450), jsonb_build_array(500, 150, 500, 600),
        jsonb_build_array(750, 0, 750, 450)),
      'sand', jsonb_build_array(jsonb_build_array(540, 0, 710, 110)),
      'water', jsonb_build_array(jsonb_build_array(290, 500, 460, 600)))
    when 6 then jsonb_build_object('name', '모래 언덕',
      'tee', jsonb_build_array(100, 100), 'cup', jsonb_build_object('x', 890, 'y', 490, 'r', 22),
      'walls', jsonb_build_array(jsonb_build_array(0, 260, 600, 260)) || duri_private.golf_rect(420, 380, 500, 600),
      'sand', jsonb_build_array(jsonb_build_array(650, 300, 800, 600), jsonb_build_array(800, 330, 1000, 420)),
      'water', jsonb_build_array(jsonb_build_array(700, 60, 860, 200)))
    when 7 then jsonb_build_object('name', '다이아몬드',
      'tee', jsonb_build_array(90, 300), 'cup', jsonb_build_object('x', 910, 'y', 300, 'r', 22),
      'walls', duri_private.golf_diamond(330, 300, 80) || duri_private.golf_diamond(540, 160, 65)
        || duri_private.golf_diamond(540, 440, 65) || duri_private.golf_diamond(760, 300, 70),
      'sand', jsonb_build_array(jsonb_build_array(450, 260, 630, 340)),
      'water', jsonb_build_array(jsonb_build_array(620, 0, 1000, 60), jsonb_build_array(620, 540, 1000, 600)))
    when 8 then jsonb_build_object('name', '좁은 문',
      'tee', jsonb_build_array(90, 300), 'cup', jsonb_build_object('x', 910, 'y', 300, 'r', 22),
      'walls', jsonb_build_array(jsonb_build_array(500, 0, 500, 265), jsonb_build_array(500, 335, 500, 600)),
      'sand', jsonb_build_array(jsonb_build_array(330, 200, 430, 400)),
      'water', jsonb_build_array(jsonb_build_array(620, 0, 730, 215), jsonb_build_array(620, 385, 730, 600)))
    else jsonb_build_object('name', '성 안의 컵',
      'tee', jsonb_build_array(80, 520), 'cup', jsonb_build_object('x', 500, 'y', 300, 'r', 22),
      'walls', jsonb_build_array(jsonb_build_array(400, 200, 600, 200), jsonb_build_array(400, 200, 400, 400),
        jsonb_build_array(400, 400, 600, 400), jsonb_build_array(600, 200, 600, 262), jsonb_build_array(600, 338, 600, 400)),
      'sand', jsonb_build_array(jsonb_build_array(700, 90, 860, 230), jsonb_build_array(700, 380, 860, 520)),
      'water', jsonb_build_array(jsonb_build_array(150, 140, 300, 440)))
    end as o) holes;
$$;

-- ---------------------------------------------------------------- physics v2
-- Same as v1 (1/60 s ticks, 3 sub-steps, bounce keeps 75%, slow enough over the cup drops in) plus:
-- sand: friction 0.93 per tick instead of 0.985; water: the roll stops there, the ball goes back to where it
-- was hit from (+1 penalty). The path holds one point per tick, so path[i] is the place after i ticks.
create or replace function duri_private.golf_simulate(hole integer, x0 double precision, y0 double precision, ang double precision, pw double precision) returns jsonb
language plpgsql stable set search_path='' as $$
declare
  c jsonb := duri_private.golf_course(hole);
  segs double precision[]; n integer := jsonb_array_length(c->'walls'); i integer; j integer; k integer;
  sand double precision[]; ns integer := jsonb_array_length(c->'sand');
  wat double precision[]; nw integer := jsonb_array_length(c->'water');
  px double precision := x0; py double precision := y0;
  vx double precision := cos(ang) * pw * 28; vy double precision := sin(ang) * pw * 28;
  r constant double precision := 12;
  cx double precision := (c->'cup'->>'x')::double precision; cy double precision := (c->'cup'->>'y')::double precision;
  cr double precision := (c->'cup'->>'r')::double precision;
  ax double precision; ay double precision; ex double precision; ey double precision; l2 double precision;
  u double precision; qx double precision; qy double precision; dx double precision; dy double precision;
  d2 double precision; d double precision; nx double precision; ny double precision; dot double precision;
  fr double precision;
  t integer := 0; holed boolean := false; wet boolean := false;
  path jsonb := jsonb_build_array(jsonb_build_array(round(x0::numeric, 1), round(y0::numeric, 1)));
begin
  for i in 0 .. n - 1 loop
    for j in 0 .. 3 loop segs[i * 4 + j + 1] := (c->'walls'->i->>j)::double precision; end loop;
  end loop;
  for i in 0 .. ns - 1 loop
    for j in 0 .. 3 loop sand[i * 4 + j + 1] := (c->'sand'->i->>j)::double precision; end loop;
  end loop;
  for i in 0 .. nw - 1 loop
    for j in 0 .. 3 loop wat[i * 4 + j + 1] := (c->'water'->i->>j)::double precision; end loop;
  end loop;
  while t < 600 loop
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
      for k in 0 .. nw - 1 loop
        if px > wat[k * 4 + 1] and px < wat[k * 4 + 3] and py > wat[k * 4 + 2] and py < wat[k * 4 + 4] then wet := true; end if;
      end loop;
      exit when wet;
    end loop;
    path := path || jsonb_build_array(jsonb_build_array(round(px::numeric, 1), round(py::numeric, 1)));
    exit when holed or wet;
    fr := 0.985;
    for k in 0 .. ns - 1 loop
      if px > sand[k * 4 + 1] and px < sand[k * 4 + 3] and py > sand[k * 4 + 2] and py < sand[k * 4 + 4] then fr := 0.93; end if;
    end loop;
    vx := vx * fr; vy := vy * fr;
    if vx * vx + vy * vy < 0.04 then exit; end if;
  end loop;
  if wet then px := x0; py := y0; end if;
  return jsonb_build_object('path', path, 'x', px, 'y', py, 'holed', holed, 'water', wet, 'ms', round(t * 1000 / 60.0)::integer);
end; $$;
revoke all on function duri_private.golf_course(integer),
  duri_private.golf_simulate(integer, double precision, double precision, double precision, double precision) from public, anon, authenticated;

create or replace function duri_private.advance_golf(gid uuid) returns void
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
      water = false, path = null, shot_started = null, moving_until = clock_timestamp() where game_id = gid;
  else
    update public.golf_games set status = 'done', finished_at = clock_timestamp() where id = gid;
    select sum(total) into sum_total from public.golf_balls where game_id = gid;
    insert into public.golf_records(room_id, holes, best) values (g.room_id, g.holes, sum_total)
      on conflict (room_id, holes) do update set best = least(public.golf_records.best, excluded.best);
  end if;
end; $$;
revoke all on function duri_private.advance_golf(uuid) from public, anon, authenticated;

create or replace function public.start_golf(target uuid, hole_count integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); partner uuid; gid uuid; tee jsonb := duri_private.golf_course(1)->'tee';
begin
  if hole_count is null or hole_count not in (3, 6, 9) then raise exception 'Invalid course'; end if;
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

-- One hit. Landing in water costs one extra stroke. 10 strokes on a hole at most.
create or replace function public.golf_shot(game uuid, shot uuid, angle double precision, power double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); g public.golf_games; b public.golf_balls; old public.golf_shots; sim jsonb;
  stroke_n integer; done boolean; wet boolean; started timestamptz := clock_timestamp(); ms integer;
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
    return jsonb_build_object('status', 'duplicate', 'n', old.n, 'holed', old.holed, 'water', old.water, 'path', old.path, 'ms', old.duration_ms,
      'startedMs', (extract(epoch from old.created_at) * 1000)::bigint,
      'untilMs', (extract(epoch from old.created_at + (old.duration_ms || ' milliseconds')::interval) * 1000)::bigint);
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
  wet := (sim->>'water')::boolean;
  ms := (sim->>'ms')::integer;
  stroke_n := least(10, b.strokes + 1 + case when wet then 1 else 0 end);
  done := (sim->>'holed')::boolean or stroke_n >= 10;
  insert into public.golf_shots(game_id, shot_id, user_id, hole, n, angle, power, physics, path, holed, water, duration_ms, created_at)
    values (game, shot, actor, g.hole, stroke_n, angle, power, 2, sim->'path', (sim->>'holed')::boolean, wet, ms, started);
  update public.golf_balls set x = (sim->>'x')::double precision, y = (sim->>'y')::double precision, strokes = stroke_n,
    holed = done, water = wet, shot_no = shot_no + 1, shot_started = started, path = sim->'path',
    moving_until = started + (ms || ' milliseconds')::interval
    where game_id = game and user_id = actor;
  return jsonb_build_object('status', 'ok', 'n', stroke_n, 'holed', done, 'water', wet, 'path', sim->'path', 'ms', ms,
    'startedMs', (extract(epoch from started) * 1000)::bigint,
    'untilMs', (extract(epoch from started + (ms || ' milliseconds')::interval) * 1000)::bigint);
end; $$;

create or replace function public.golf_state(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); g public.golf_games; best jsonb; me jsonb; pa jsonb;
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
  select * into g from public.golf_games where room_id = target order by created_at desc limit 1;
  if found and g.status = 'open' then perform duri_private.advance_golf(g.id); select * into g from public.golf_games where id = g.id; end if;
  select coalesce(jsonb_object_agg(holes::text, r.best), '{}'::jsonb) into best from public.golf_records r where r.room_id = target;
  if g.id is null then return jsonb_build_object('game', null, 'best', best, 'nowMs', (extract(epoch from clock_timestamp()) * 1000)::bigint); end if;
  select jsonb_build_object('x', b.x, 'y', b.y, 'strokes', b.strokes, 'total', b.total, 'holed', b.holed, 'water', b.water, 'shotNo', b.shot_no,
      'startedMs', (extract(epoch from b.shot_started) * 1000)::bigint, 'untilMs', (extract(epoch from b.moving_until) * 1000)::bigint, 'path', b.path)
    into me from public.golf_balls b where b.game_id = g.id and b.user_id = actor;
  select jsonb_build_object('x', b.x, 'y', b.y, 'strokes', b.strokes, 'total', b.total, 'holed', b.holed, 'water', b.water, 'shotNo', b.shot_no,
      'startedMs', (extract(epoch from b.shot_started) * 1000)::bigint, 'untilMs', (extract(epoch from b.moving_until) * 1000)::bigint, 'path', b.path)
    into pa from public.golf_balls b where b.game_id = g.id and b.user_id <> actor;
  return jsonb_build_object('game', g.id, 'holes', g.holes, 'hole', g.hole, 'status', g.status,
    'course', duri_private.golf_course(g.hole), 'me', me, 'partner', pa, 'best', best,
    'nowMs', (extract(epoch from clock_timestamp()) * 1000)::bigint);
end; $$;

commit;
