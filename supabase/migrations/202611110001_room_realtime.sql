-- P2: tell both partners, without a page refresh, when someone joins or leaves their room.
-- Uses a private Realtime Broadcast topic per room: "room:<room id>".
-- Only members of that room may listen; the message carries no personal data.
begin;

create function duri_private.notify_room_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform realtime.send(
    jsonb_build_object('change', lower(tg_op)),
    'members',
    'room:' || coalesce(new.room_id, old.room_id)::text,
    true
  );
  return null;
end; $$;
revoke all on function duri_private.notify_room_change() from public, anon, authenticated;

create trigger couple_members_notify
  after insert or delete on public.couple_members
  for each row execute function duri_private.notify_room_change();

-- Who may listen: a signed-in member of the room named in the topic.
-- The CASE keeps a malformed topic from ever reaching the uuid cast.
create function duri_private.can_listen(topic text) returns boolean
language sql stable security definer set search_path='' as $$
  select case
    when topic ~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then duri_private.is_member(substr(topic, 6)::uuid)
    else false
  end;
$$;
revoke all on function duri_private.can_listen(text) from public, anon, authenticated;
grant execute on function duri_private.can_listen(text) to authenticated;

create policy room_members_listen on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and duri_private.can_listen((select realtime.topic())));

commit;
