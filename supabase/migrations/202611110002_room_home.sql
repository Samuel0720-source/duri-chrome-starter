-- P3: the couple's room home. Shared mood, editable first day and time zone,
-- and a shared list of plans (the calendar). Every write goes through an RPC that
-- checks membership of an open room; both partners hear about changes live.
begin;

create table public.room_plans (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  on_date date not null check (on_date between '1900-01-01' and '9998-12-31'),
  title text not null check (char_length(title) between 1 and 60),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.room_plans(room_id, on_date);
alter table public.room_plans enable row level security;
revoke all on public.room_plans from public, anon, authenticated;
grant select on public.room_plans to authenticated;
create policy room_members_read_plans on public.room_plans
  for select to authenticated using (duri_private.is_member(room_id));

create function public.set_room_mood(target uuid, new_mood text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if new_mood is null or new_mood not in ('berry','forest','cafe','sunset','night') then raise exception 'Invalid mood'; end if;
  update public.couple_rooms set mood=new_mood where id=target and closed_at is null and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
end; $$;

create function public.set_room_start(target uuid, first_day date, zone text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if first_day is null or first_day not between '1900-01-01' and '9998-12-31'
     or not exists(select 1 from pg_catalog.pg_timezone_names where name=zone)
    then raise exception 'Invalid account, date or timezone'; end if;
  update public.couple_rooms set start_date=first_day, timezone=zone
    where id=target and closed_at is null and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
end; $$;

create function public.add_room_plan(target uuid, plan_date date, plan_title text) returns uuid
language plpgsql security definer set search_path='' as $$
declare clean text := btrim(coalesce(plan_title, '')); pid uuid;
begin
  if plan_date is null or char_length(clean) not between 1 and 60 then raise exception 'Invalid plan'; end if;
  perform 1 from public.couple_rooms where id=target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  if (select count(*) from public.room_plans where room_id=target) >= 200 then raise exception 'Too many plans'; end if;
  insert into public.room_plans(room_id, on_date, title, created_by) values(target, plan_date, clean, auth.uid()) returning id into pid;
  return pid;
end; $$;

create function public.remove_room_plan(plan uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  delete from public.room_plans p using public.couple_rooms r
    where p.id=plan and r.id=p.room_id and r.closed_at is null and duri_private.is_member(p.room_id);
  if not found then raise exception 'Plan unavailable'; end if;
end; $$;

revoke all on function public.set_room_mood(uuid,text), public.set_room_start(uuid,date,text),
  public.add_room_plan(uuid,date,text), public.remove_room_plan(uuid) from public, anon, authenticated;
grant execute on function public.set_room_mood(uuid,text), public.set_room_start(uuid,date,text),
  public.add_room_plan(uuid,date,text), public.remove_room_plan(uuid) to authenticated;

-- One broadcaster for room-level changes. TG_ARGV[0] names the event ('room' or 'plans').
create function duri_private.broadcast_room_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare rec jsonb := to_jsonb(coalesce(new, old));
begin
  perform realtime.send(
    jsonb_build_object('change', lower(tg_op)),
    tg_argv[0],
    'room:' || coalesce(rec->>'room_id', rec->>'id'),
    true
  );
  return null;
end; $$;
revoke all on function duri_private.broadcast_room_event() from public, anon, authenticated;

create trigger couple_rooms_notify
  after update of start_date, timezone, mood on public.couple_rooms
  for each row when (old.closed_at is null) execute function duri_private.broadcast_room_event('room');
create trigger room_plans_notify
  after insert or delete on public.room_plans
  for each row execute function duri_private.broadcast_room_event('plans');

commit;
