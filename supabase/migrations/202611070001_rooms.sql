-- Foundation for P2. Apply to a Supabase project with auth.users, auth.uid(),
-- anon and authenticated. The database suite supplies only these Auth interfaces.
begin;

create schema if not exists duri_private;
revoke all on schema duri_private from public;
grant usage on schema duri_private to authenticated;

create table public.couple_rooms (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  timezone text not null,
  closed_at timestamptz,
  mood text not null default 'berry' check (mood in ('berry','forest','cafe','sunset','night'))
);
create table public.couple_members (
  user_id uuid primary key references auth.users(id) on delete restrict,
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  seat smallint not null check (seat in (1,2)),
  unique (room_id, seat)
);
create table duri_private.invites (
  token_hash bytea primary key,
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index on duri_private.invites(room_id);
create table public.room_notices (
  id uuid primary key default gen_random_uuid(),
  recipient uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind='partner_left'),
  created_at timestamptz not null default now()
);
create index on public.room_notices(recipient);

alter table public.couple_rooms enable row level security;
alter table public.couple_members enable row level security;
alter table public.room_notices enable row level security;
revoke all on public.couple_rooms,public.couple_members,public.room_notices,duri_private.invites from public,anon,authenticated;
grant select on public.couple_rooms,public.couple_members,public.room_notices to authenticated;

-- The owner can inspect membership without recursively invoking its own RLS policy.
create function duri_private.is_member(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.couple_members where room_id=target and user_id=(select auth.uid()));
$$;
revoke all on function duri_private.is_member(uuid) from public,anon,authenticated;
grant execute on function duri_private.is_member(uuid) to authenticated;
create policy room_members_read_rooms on public.couple_rooms for select to authenticated
  using (closed_at is null and duri_private.is_member(id));
create policy room_members_read_seats on public.couple_members for select to authenticated
  using (duri_private.is_member(room_id));
create policy own_notices on public.room_notices for select to authenticated using (recipient=(select auth.uid()));

create function public.create_couple_room(first_day date, zone text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); rid uuid;
begin
  if actor is null or first_day is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone)
    then raise exception 'Invalid account, date or timezone'; end if;
  insert into public.couple_rooms(start_date,timezone) values(first_day,zone) returning id into rid;
  insert into public.couple_members(user_id,room_id,seat) values(actor,rid,1);
  return rid;
end; $$;

create function public.issue_couple_invite(target uuid) returns text
language plpgsql security definer set search_path='' as $$
declare raw_token text;
begin
  perform 1 from public.couple_rooms where id=target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  if exists(select 1 from public.couple_members where room_id=target and seat=2) then raise exception 'Room full'; end if;
  delete from duri_private.invites where room_id=target;
  raw_token := replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into duri_private.invites(token_hash,room_id,expires_at)
    values(sha256(convert_to(raw_token,'UTF8')),target,now()+interval '48 hours');
  return raw_token;
end; $$;

create function public.accept_couple_invite(raw_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); digest bytea := sha256(convert_to(raw_token,'UTF8')); rid uuid;
begin
  if actor is null then raise exception 'Sign in required'; end if;
  select room_id into rid from duri_private.invites where token_hash=digest;
  perform 1 from public.couple_rooms where id=rid and closed_at is null for update;
  if not found then raise exception 'Invite unavailable'; end if;
  if duri_private.is_member(rid) then return rid; end if;
  update duri_private.invites set used_at=clock_timestamp()
    where token_hash=digest and room_id=rid and used_at is null and expires_at>clock_timestamp();
  if not found then raise exception 'Invite unavailable'; end if;
  insert into public.couple_members(user_id,room_id,seat) values(actor,rid,2);
  return rid;
end; $$;

-- Closing revokes both memberships and invitations; personal deletion is separate.
create function public.leave_couple_room(target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.couple_rooms where id=target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  insert into public.room_notices(recipient,kind)
    select user_id,'partner_left' from public.couple_members where room_id=target and user_id<>auth.uid();
  update public.couple_rooms set closed_at=clock_timestamp() where id=target;
  delete from duri_private.invites where room_id=target;
  delete from public.couple_members where room_id=target;
end; $$;

revoke all on function public.create_couple_room(date,text),public.issue_couple_invite(uuid),
  public.accept_couple_invite(text),public.leave_couple_room(uuid) from public,anon,authenticated;
grant execute on function public.create_couple_room(date,text),public.issue_couple_invite(uuid),
  public.accept_couple_invite(text),public.leave_couple_room(uuid) to authenticated;
commit;
