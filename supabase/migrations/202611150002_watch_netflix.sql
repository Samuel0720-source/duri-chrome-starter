-- P8-2: 함께 보기 with Netflix, the Teleparty way.
--  * Netflix cannot play inside another site (DRM) and an account belongs to one household, so each person
--    opens the title in their own Netflix tab. The Chrome extension 둘이 relays play / pause / position
--    between that tab and the 함께 보기 page. The database keeps the same timetable as for every other source.
--  * source 'netflix', video_id = the number in netflix.com/watch/<n> or netflix.com/title/<n>.
begin;

alter table public.watch_sessions drop constraint watch_sessions_source_check;
alter table public.watch_sessions add constraint watch_sessions_source_check
  check (source in ('youtube', 'vimeo', 'file', 'netflix'));
alter table public.watch_sessions drop constraint watch_sessions_video_check;
alter table public.watch_sessions add constraint watch_sessions_video_check check (
  video_id is null
  or (source = 'youtube' and video_id ~ '^[A-Za-z0-9_-]{11}$')
  or (source = 'vimeo' and video_id ~ '^[0-9]{5,12}(:[0-9a-f]{6,24})?$')
  or (source = 'file' and char_length(video_id) <= 600 and video_id ~ '^https://[^[:space:]"''<>\\]+$')
  or (source = 'netflix' and video_id ~ '^[0-9]{5,12}$'));

create or replace function duri_private.parse_video(raw text, out source text, out ref text)
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
  m := regexp_match(t, '^https?://(?:www\.)?netflix\.com/(?:[a-z]{2}(?:-[a-z]{2})?/)?(?:watch|title)/([0-9]{5,12})(?:[/?#].*)?$', 'i');
  if m is not null then source := 'netflix'; ref := m[1]; return; end if;
  if t ~* '^https://[^[:space:]"''<>\\]+\.(mp4|webm|ogg|ogv|mov|m4v)([?#][^[:space:]"''<>\\]*)?$' then
    source := 'file'; ref := t; return;
  end if;
end; $$;
revoke all on function duri_private.parse_video(text) from public, anon, authenticated;

commit;
