-- P7-1: what each partner sets for the pair (a nickname for the other) and how far each has read the chat.
--  * One row per member of a room. Both partners may read both rows (to show "읽음" and the nickname),
--    nobody writes the table directly: only the two functions below.
--  * Nickname: 1-20 characters, trimmed, no control characters; empty clears it.
--  * Read position only moves forward and never past the room's newest message.
--  * A change rings the room's doorbell with the event 'prefs' (no names or ids in the signal).
begin;

create table public.member_prefs (
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  partner_nickname text check (partner_nickname is null or char_length(partner_nickname) between 1 and 20),
  read_upto bigint not null default 0,
  read_at timestamptz,
  primary key (room_id, user_id)
);
alter table public.member_prefs enable row level security;
revoke all on public.member_prefs from public, anon, authenticated;
grant select on public.member_prefs to authenticated;
create policy room_members_read_prefs on public.member_prefs
  for select to authenticated using (duri_private.is_member(room_id));

-- The name I call my partner. Returns the saved name (null when cleared).
create function public.set_partner_nickname(target uuid, nick text) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); clean text := nullif(btrim(coalesce(nick, '')), '');
begin
  if clean is not null and (char_length(clean) > 20 or clean ~ '[[:cntrl:]]') then raise exception 'Invalid nickname'; end if;
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
  insert into public.member_prefs(room_id, user_id, partner_nickname) values (target, actor, clean)
    on conflict (room_id, user_id) do update set partner_nickname = excluded.partner_nickname;
  return clean;
end; $$;

-- "I have seen the chat up to message upto." Moves forward only, never past the newest message.
create function public.mark_chat_read(target uuid, upto bigint) returns bigint
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); newest bigint; cur bigint;
begin
  if upto is null or upto < 0 then raise exception 'Invalid position'; end if;
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
  select coalesce(max(id), 0) into newest from public.room_messages where room_id = target;
  insert into public.member_prefs(room_id, user_id) values (target, actor) on conflict do nothing;
  select read_upto into cur from public.member_prefs where room_id = target and user_id = actor for update;
  if least(upto, newest) > cur then
    update public.member_prefs set read_upto = least(upto, newest), read_at = clock_timestamp()
      where room_id = target and user_id = actor;
    return least(upto, newest);
  end if;
  return cur;
end; $$;

revoke all on function public.set_partner_nickname(uuid, text), public.mark_chat_read(uuid, bigint) from public, anon, authenticated;
grant execute on function public.set_partner_nickname(uuid, text), public.mark_chat_read(uuid, bigint) to authenticated;

create trigger member_prefs_insert_notify after insert on public.member_prefs
  for each row execute function duri_private.broadcast_room_event('prefs');
create trigger member_prefs_update_notify after update on public.member_prefs
  for each row when (old.partner_nickname is distinct from new.partner_nickname or old.read_upto is distinct from new.read_upto)
  execute function duri_private.broadcast_room_event('prefs');

commit;
