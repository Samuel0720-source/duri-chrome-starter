-- P7-3: 함께 보기 with more than YouTube.
--  * source: 'youtube' (11-character id), 'vimeo' (number, optionally ":hash" for unlisted videos) or
--    'file' (an https address of a video file the browser can play: .mp4 .webm .ogg .ogv .mov .m4v).
--  * The link is parsed here (the browser parses too, only to answer faster). Nothing else changes:
--    same timetable, same revisions, same ready / heartbeat rules.
begin;

alter table public.watch_sessions drop constraint watch_sessions_video_id_check;
alter table public.watch_sessions add column source text not null default 'youtube' check (source in ('youtube', 'vimeo', 'file'));
alter table public.watch_sessions add constraint watch_sessions_video_check check (
  video_id is null
  or (source = 'youtube' and video_id ~ '^[A-Za-z0-9_-]{11}$')
  or (source = 'vimeo' and video_id ~ '^[0-9]{5,12}(:[0-9a-f]{6,24})?$')
  or (source = 'file' and char_length(video_id) <= 600 and video_id ~ '^https://[^[:space:]"''<>\\]+$'));

-- A pasted link -> (source, ref), or nothing.
create function duri_private.parse_video(raw text, out source text, out ref text)
language plpgsql immutable set search_path='' as $$
declare t text := btrim(coalesce(raw, '')); m text[];
begin
  source := null; ref := null;
  if t = '' or char_length(t) > 600 then return; end if;
  ref := duri_private.parse_youtube(t);
  if ref is not null then source := 'youtube'; return; end if;
  m := regexp_match(t, '^https?://(?:www\.|player\.)?vimeo\.com/(?:video/|channels/[A-Za-z0-9_-]+/)?([0-9]{5,12})(?:/([0-9a-f]{6,24}))?(?:[/?#].*)?$', 'i');
  if m is not null then
    source := 'vimeo';
    ref := m[1] || coalesce(':' || lower(m[2]), ':' || lower(substring(t from '[?&]h=([0-9a-fA-F]{6,24})')), '');
    return;
  end if;
  if t ~* '^https://[^[:space:]"''<>\\]+\.(mp4|webm|ogg|ogv|mov|m4v)([?#][^[:space:]"''<>\\]*)?$' then
    source := 'file'; ref := t; return;
  end if;
end; $$;
revoke all on function duri_private.parse_video(text) from public, anon, authenticated;

create or replace function public.watch_set_video(target uuid, link text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); v record;
begin
  select * into v from duri_private.parse_video(link);
  if v.ref is null then raise exception 'Invalid video link'; end if;
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  insert into public.watch_sessions(room_id) values (target) on conflict do nothing;
  -- A new video starts from 0:00, paused, and waits until both press ready.
  update public.watch_sessions set source = v.source, video_id = v.ref, position_sec = 0, ref_at = clock_timestamp(),
    playing = false, autostart = true, revision = revision + 1, last_request = null,
    updated_by = actor, updated_at = clock_timestamp()
  where room_id = target;
  update public.watch_presence set ready = false where room_id = target;
  insert into public.watch_presence(room_id, user_id, here, last_seen)
    values (target, actor, true, clock_timestamp())
    on conflict (room_id, user_id) do update set here = true, last_seen = clock_timestamp();
end; $$;

create or replace function public.watch_state(target uuid) returns jsonb
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
    'source', coalesce(s.source, 'youtube'),
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

commit;
