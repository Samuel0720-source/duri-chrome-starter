-- P8-1: the couple's photo album, and one album photo as the shared room background.
--  * Files live in the private Storage bucket 'room-photos' under '<room id>/<photo id>.jpg' (big, at most
--    1600px) and '<room id>/<photo id>_t.jpg' (thumbnail). The browser re-encodes every picture first, which
--    also drops camera data such as GPS location.
--  * Only the two members of a room can upload, see or remove files in its folder (Storage policies below).
--  * public.room_photos lists the album. Nobody writes it directly: add_room_photo / delete_room_photo.
--    Only the person who added a photo can take it out of the album.
--  * couple_rooms.wallpaper points at one album photo; both partners see the same background.
--    Removing that photo clears the background (on delete set null).
--  * At most 200 photos per room (free Storage space is shared by every room).
--  * Closing a room removes its album rows; the app removes the files before it closes the room.
begin;

-- Which room a Storage object belongs to, or null when the name is not '<uuid>/<uuid>[_t].jpg'.
create function duri_private.photo_room(object_name text) returns uuid
language sql immutable set search_path='' as $$
  select case when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(_t)?\.jpg$'
    then split_part(object_name, '/', 1)::uuid end
$$;
revoke all on function duri_private.photo_room(text) from public, anon, authenticated;
grant execute on function duri_private.photo_room(text) to authenticated;

create table public.room_photos (
  id uuid primary key,
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  width int not null check (width between 1 and 1600),
  height int not null check (height between 1 and 1600),
  created_at timestamptz not null default now()
);
create index room_photos_room on public.room_photos(room_id, created_at desc);
alter table public.room_photos enable row level security;
revoke all on public.room_photos from public, anon, authenticated;
grant select on public.room_photos to authenticated;
create policy room_members_read_photos on public.room_photos
  for select to authenticated using (duri_private.is_member(room_id));

alter table public.couple_rooms add column wallpaper uuid references public.room_photos(id) on delete set null;

-- Called after the browser has uploaded both files. Returns the photo id.
create function public.add_room_photo(target uuid, photo uuid, w int, h int) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); n int;
begin
  if photo is null or w is null or h is null or w not between 1 and 1600 or h not between 1 and 1600 then raise exception 'Invalid photo'; end if;
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  select count(*) into n from public.room_photos where room_id = target;
  if n >= 200 then raise exception 'Album full'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'room-photos' and name = target || '/' || photo || '.jpg')
    then raise exception 'Photo not uploaded'; end if;
  insert into public.room_photos(id, room_id, added_by, width, height) values (photo, target, actor, w, h)
    on conflict (id) do nothing;
  return photo;
end; $$;

-- Takes a photo out of the album (only the person who added it). Returns the two file names to remove.
create function public.delete_room_photo(photo uuid) returns text[]
language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
  delete from public.room_photos p using public.couple_rooms r
    where p.id = photo and r.id = p.room_id and r.closed_at is null
      and p.added_by = auth.uid() and duri_private.is_member(p.room_id)
    returning p.room_id into rid;
  if rid is null then raise exception 'Photo unavailable'; end if;
  return array[rid || '/' || photo || '.jpg', rid || '/' || photo || '_t.jpg'];
end; $$;

-- Sets (or with null clears) the shared background. The photo must be in this room's album.
create function public.set_room_wallpaper(target uuid, photo uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if photo is not null and not exists (select 1 from public.room_photos where id = photo and room_id = target)
    then raise exception 'Photo unavailable'; end if;
  update public.couple_rooms set wallpaper = photo where id = target and closed_at is null and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
end; $$;

revoke all on function public.add_room_photo(uuid,uuid,int,int), public.delete_room_photo(uuid),
  public.set_room_wallpaper(uuid,uuid) from public, anon, authenticated;
grant execute on function public.add_room_photo(uuid,uuid,int,int), public.delete_room_photo(uuid),
  public.set_room_wallpaper(uuid,uuid) to authenticated;

-- The background is room-level, so it rings the same 'room' doorbell as the theme.
drop trigger couple_rooms_notify on public.couple_rooms;
create trigger couple_rooms_notify
  after update of start_date, timezone, mood, wallpaper on public.couple_rooms
  for each row when (old.closed_at is null) execute function duri_private.broadcast_room_event('room');
create trigger room_photos_notify
  after insert or delete on public.room_photos
  for each row execute function duri_private.broadcast_room_event('photos');

-- A closed room keeps no album rows.
create function duri_private.clear_closed_album() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.couple_rooms set wallpaper = null where id = new.id;
  delete from public.room_photos where room_id = new.id;
  return null;
end; $$;
revoke all on function duri_private.clear_closed_album() from public, anon, authenticated;
create trigger couple_rooms_clear_album
  after update of closed_at on public.couple_rooms
  for each row when (old.closed_at is null and new.closed_at is not null)
  execute function duri_private.clear_closed_album();

-- Storage: a private bucket, JPEG/WebP only, 5 MB per file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('room-photos', 'room-photos', false, 5242880, array['image/jpeg', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy room_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'room-photos' and duri_private.is_member(duri_private.photo_room(name)));
create policy room_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'room-photos' and duri_private.is_member(duri_private.photo_room(name)));
create policy room_photos_remove on storage.objects for delete to authenticated
  using (bucket_id = 'room-photos' and duri_private.is_member(duri_private.photo_room(name)));

commit;
