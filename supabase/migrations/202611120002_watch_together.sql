-- P4-2: "함께 보기". One partner pastes a YouTube link, both press ready, both watch in sync.
--  * The database keeps ONE timetable per room: video id, a reference position, the database time of
--    that reference, a playing flag and an ever-increasing revision.
--    Target position while playing = reference position + (database now - reference time).
--  * Every play / pause / seek / new video bumps the revision, so browsers can drop stale or echoed events.
--  * The link is parsed here too (the browser also checks it, only to answer faster).
--  * When both partners have left (or went silent for 45 s), the position is frozen where the last one was seen.
--  * The realtime signal carries only the event name 'watch'; browsers re-read watch_state().
begin;

create table public.watch_sessions (
  room_id uuid primary key references public.couple_rooms(id) on delete cascade,
  video_id text check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  position_sec numeric(10, 3) not null default 0 check (position_sec between 0 and 43200),
  ref_at timestamptz not null default clock_timestamp(),
  playing boolean not null default false,
  autostart boolean not null default false,
  revision bigint not null default 0,
  last_request uuid,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp(),
  check (not playing or video_id is not null)
);

-- Who is on the watch screen right now, and who pressed ready.
create table public.watch_presence (
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  here boolean not null default false,
  ready boolean not null default false,
  last_seen timestamptz not null default clock_timestamp(),
  primary key (room_id, user_id)
);

alter table public.watch_sessions enable row level security;
alter table public.watch_presence enable row level security;
-- No direct table access at all: everything goes through the functions below.
revoke all on public.watch_sessions, public.watch_presence from public, anon, authenticated;

-- ---------------------------------------------------------------- helpers
-- Takes a pasted link, returns the 11-character video id or null.
create function duri_private.parse_youtube(raw text) returns text
language sql immutable set search_path='' as $$
  select case
    when raw is null or char_length(raw) > 300 then null
    when btrim(raw) !~* '^https?://(www\.|m\.|music\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)/' then null
    else substring(btrim(raw) from '(?:youtu\.be/|youtube(?:-nocookie)?\.com/(?:embed/|shorts/|live/|v/)|[?&]v=)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])')
  end;
$$;
revoke all on function duri_private.parse_youtube(text) from public, anon, authenticated;

-- If nobody is on the screen any more, stop the clock where the last person was seen.
create function duri_private.settle_watch(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.watch_sessions; seen timestamptz;
begin
  select * into s from public.watch_sessions where room_id = target for update;
  if not found or not s.playing then return; end if;
  perform 1 from public.watch_presence
    where room_id = target and here and last_seen > clock_timestamp() - interval '45 seconds';
  if found then return; end if;
  select max(last_seen) into seen from public.watch_presence where room_id = target;
  update public.watch_sessions set
    position_sec = least(43200, position_sec + greatest(0, extract(epoch from (coalesce(seen, ref_at) - ref_at)))),
    ref_at = clock_timestamp(), playing = false, revision = revision + 1,
    updated_by = null, updated_at = clock_timestamp()
  where room_id = target;
end; $$;
revoke all on function duri_private.settle_watch(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- functions
-- Opens the room's watch session (if needed) and marks me as present.
create function public.watch_ping(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
  insert into public.watch_sessions(room_id) values (target) on conflict do nothing;
  insert into public.watch_presence(room_id, user_id, here, last_seen)
    values (target, actor, true, clock_timestamp())
    on conflict (room_id, user_id) do update set here = true, last_seen = clock_timestamp();
end; $$;

-- Leaving the screen: not present, not ready; the clock stops if I was the last one.
create function public.watch_leave(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
  perform 1 from public.couple_rooms where id = target and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
  update public.watch_presence set here = false, ready = false, last_seen = clock_timestamp()
    where room_id = target and user_id = actor;
  perform duri_private.settle_watch(target);
end; $$;

create function public.watch_set_video(target uuid, link text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); vid text := duri_private.parse_youtube(link);
begin
  if vid is null then raise exception 'Invalid video link'; end if;
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  insert into public.watch_sessions(room_id) values (target) on conflict do nothing;
  -- A new video starts from 0:00, paused, and waits until both press ready.
  update public.watch_sessions set video_id = vid, position_sec = 0, ref_at = clock_timestamp(),
    playing = false, autostart = true, revision = revision + 1, last_request = null,
    updated_by = actor, updated_at = clock_timestamp()
  where room_id = target;
  update public.watch_presence set ready = false where room_id = target;
  insert into public.watch_presence(room_id, user_id, here, last_seen)
    values (target, actor, true, clock_timestamp())
    on conflict (room_id, user_id) do update set here = true, last_seen = clock_timestamp();
end; $$;

-- "Ready" / "not ready". When both are ready for a fresh video, it starts for both at the same database time.
create function public.watch_ready(target uuid, is_ready boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); s public.watch_sessions; both_ready boolean;
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  select * into s from public.watch_sessions where room_id = target;
  if not found or s.video_id is null then raise exception 'No video'; end if;
  insert into public.watch_presence(room_id, user_id, here, ready, last_seen)
    values (target, actor, true, coalesce(is_ready, false), clock_timestamp())
    on conflict (room_id, user_id) do update set here = true, ready = coalesce(is_ready, false), last_seen = clock_timestamp();
  select count(*) = 2 into both_ready from public.watch_presence
    where room_id = target and here and ready and last_seen > clock_timestamp() - interval '45 seconds';
  if both_ready and s.autostart and not s.playing then
    update public.watch_sessions set playing = true, autostart = false, ref_at = clock_timestamp(),
      revision = revision + 1, updated_by = null, updated_at = clock_timestamp()
    where room_id = target;
  end if;
end; $$;

-- One command from one person: 'play', 'pause' or 'seek' at a position. Returns the new revision.
-- request_id makes a resent command harmless.
create function public.watch_command(target uuid, kind text, pos numeric, request_id uuid) returns bigint
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); s public.watch_sessions;
begin
  if kind is null or kind not in ('play', 'pause', 'seek') then raise exception 'Invalid command'; end if;
  if pos is null or pos < 0 or pos > 43200 then raise exception 'Invalid position'; end if;
  if request_id is null then raise exception 'Invalid command'; end if;
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  select * into s from public.watch_sessions where room_id = target;
  if not found or s.video_id is null then raise exception 'No video'; end if;
  if s.last_request = request_id then return s.revision; end if;
  if s.updated_by = actor and s.updated_at > clock_timestamp() - interval '150 milliseconds' then
    raise exception 'Too many commands';
  end if;
  update public.watch_sessions set
    position_sec = round(pos, 3),
    ref_at = clock_timestamp(),
    playing = case kind when 'play' then true when 'pause' then false else playing end,
    autostart = false,
    revision = revision + 1, last_request = request_id,
    updated_by = actor, updated_at = clock_timestamp()
  where room_id = target returning * into s;
  insert into public.watch_presence(room_id, user_id, here, last_seen)
    values (target, actor, true, clock_timestamp())
    on conflict (room_id, user_id) do update set here = true, last_seen = clock_timestamp();
  return s.revision;
end; $$;

create function public.watch_state(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); s public.watch_sessions; me public.watch_presence; pa public.watch_presence;
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
  perform duri_private.settle_watch(target);
  select * into s from public.watch_sessions where room_id = target;
  select * into me from public.watch_presence where room_id = target and user_id = actor;
  select * into pa from public.watch_presence where room_id = target and user_id <> actor;
  return jsonb_build_object(
    'videoId', s.video_id,
    'positionSec', coalesce(s.position_sec, 0),
    'refMs', (extract(epoch from coalesce(s.ref_at, clock_timestamp())) * 1000)::bigint,
    'nowMs', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'playing', coalesce(s.playing, false),
    'revision', coalesce(s.revision, 0),
    'by', case when s.updated_by is null then null when s.updated_by = actor then 'me' else 'partner' end,
    'meReady', coalesce(me.ready, false),
    'partnerReady', coalesce(pa.ready and pa.here and pa.last_seen > clock_timestamp() - interval '45 seconds', false),
    'partnerHere', coalesce(pa.here and pa.last_seen > clock_timestamp() - interval '45 seconds', false)
  );
end; $$;

revoke all on function public.watch_ping(uuid), public.watch_leave(uuid), public.watch_set_video(uuid, text),
  public.watch_ready(uuid, boolean), public.watch_command(uuid, text, numeric, uuid), public.watch_state(uuid)
  from public, anon, authenticated;
grant execute on function public.watch_ping(uuid), public.watch_leave(uuid), public.watch_set_video(uuid, text),
  public.watch_ready(uuid, boolean), public.watch_command(uuid, text, numeric, uuid), public.watch_state(uuid)
  to authenticated;

-- ---------------------------------------------------------------- live signals (event name only)
create trigger watch_sessions_notify after insert or update on public.watch_sessions
  for each row execute function duri_private.broadcast_room_event('watch');
-- Heartbeats (only last_seen changes) stay silent; ready / present changes ring the doorbell.
create trigger watch_presence_insert_notify after insert on public.watch_presence
  for each row execute function duri_private.broadcast_room_event('watch');
create trigger watch_presence_update_notify after update on public.watch_presence
  for each row when (old.ready is distinct from new.ready or old.here is distinct from new.here)
  execute function duri_private.broadcast_room_event('watch');

commit;
