-- P3: chat between the two partners of a room.
-- Sends go through an RPC with a client request id, so a retried send never doubles.
-- Only members read; a sender may delete their own messages; partners hear changes live.
begin;

create table public.room_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  sender uuid references auth.users(id) on delete set null,
  client_id uuid not null,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (room_id, client_id)
);
create index on public.room_messages(room_id, id);
create index on public.room_messages(sender, created_at);
alter table public.room_messages enable row level security;
revoke all on public.room_messages from public, anon, authenticated;
grant select on public.room_messages to authenticated;
create policy room_members_read_messages on public.room_messages
  for select to authenticated using (duri_private.is_member(room_id));

create function public.send_room_message(target uuid, request uuid, message text) returns bigint
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); clean text := btrim(coalesce(message, '')); mid bigint;
begin
  if actor is null then raise exception 'Sign in required'; end if;
  if request is null or char_length(clean) not between 1 and 1000 then raise exception 'Invalid message'; end if;
  perform 1 from public.couple_rooms where id=target and closed_at is null and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
  -- A retried request returns the message it already made.
  select id into mid from public.room_messages where room_id=target and client_id=request and sender=actor;
  if found then return mid; end if;
  if (select count(*) from public.room_messages
      where sender=actor and created_at > clock_timestamp() - interval '10 seconds') >= 10
    then raise exception 'Slow down'; end if;
  insert into public.room_messages(room_id, sender, client_id, body) values(target, actor, request, clean)
    on conflict (room_id, client_id) do nothing returning id into mid;
  if mid is null then
    select id into mid from public.room_messages where room_id=target and client_id=request and sender=actor;
    if not found then raise exception 'Invalid message'; end if;
  end if;
  return mid;
end; $$;

create function public.delete_my_message(message_id bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
  delete from public.room_messages m using public.couple_rooms r
    where m.id=message_id and m.sender=auth.uid() and r.id=m.room_id and r.closed_at is null and duri_private.is_member(m.room_id);
  if not found then raise exception 'Message unavailable'; end if;
end; $$;

revoke all on function public.send_room_message(uuid,uuid,text), public.delete_my_message(bigint) from public, anon, authenticated;
grant execute on function public.send_room_message(uuid,uuid,text), public.delete_my_message(bigint) to authenticated;

create trigger room_messages_notify
  after insert or delete on public.room_messages
  for each row execute function duri_private.broadcast_room_event('messages');

commit;
