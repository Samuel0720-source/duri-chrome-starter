-- P5-1: the cost gate. Every paid upstream call (AI, places search) must first get a reservation here.
--  * Defaults are closed: paid_enabled=false, monthly budget 0, prices unset. Nothing can be reserved until the operator sets them.
--  * One settings row is locked FOR UPDATE for every reservation, so the whole project's month total and each
--    room's day count are checked one request at a time, even across many server instances.
--  * A reservation books the worst-case price BEFORE the upstream call. After the answer it is settled to the
--    real price; if the answer never arrives (timeout), it stays reserved at the worst case.
--  * Only the server's service_role can reserve / settle / release. Members only see their own usage counts.
begin;

create table duri_private.api_settings (
  id boolean primary key default true check (id),
  paid_enabled boolean not null default false,
  monthly_budget_cents integer not null default 0 check (monthly_budget_cents >= 0),
  room_daily_ai integer not null default 10 check (room_daily_ai >= 0),
  room_daily_places integer not null default 3 check (room_daily_places >= 0),
  price_ai_cents integer check (price_ai_cents > 0),
  price_places_cents integer check (price_places_cents > 0)
);
insert into duri_private.api_settings(id) values (true);

create table duri_private.api_ledger (
  request_key text primary key check (char_length(request_key) between 8 and 80),
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  kind text not null check (kind in ('ai', 'places')),
  day date not null,
  month date not null,
  reserved_cents integer not null check (reserved_cents > 0),
  settled_cents integer check (settled_cents >= 0),
  status text not null default 'reserved' check (status in ('reserved', 'settled', 'released')),
  created_at timestamptz not null default clock_timestamp()
);
create index api_ledger_room_day on duri_private.api_ledger(room_id, day, kind);
create index api_ledger_month on duri_private.api_ledger(month);

alter table duri_private.api_settings enable row level security;
alter table duri_private.api_ledger enable row level security;
revoke all on duri_private.api_settings, duri_private.api_ledger from public, anon, authenticated;

-- Books the worst-case cost. Returns {ok:true} or {ok:false, reason}. A repeated request_key is a replay, never a second charge.
create function public.reserve_api_call(target uuid, kind text, request_key text, worst_cents integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s duri_private.api_settings; today date := (clock_timestamp() at time zone 'utc')::date;
  this_month date := date_trunc('month', clock_timestamp() at time zone 'utc')::date;
  price integer; limit_day integer; used_day integer; spent integer;
begin
  if kind not in ('ai', 'places') or worst_cents is null or worst_cents <= 0 then raise exception 'Invalid api call'; end if;
  -- The one lock every paid call passes through.
  select * into s from duri_private.api_settings where id for update;
  if exists (select 1 from duri_private.api_ledger l where l.request_key = reserve_api_call.request_key) then
    return jsonb_build_object('ok', true, 'replay', true);
  end if;
  perform 1 from public.couple_rooms where id = target and closed_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'room'); end if;
  if not s.paid_enabled then return jsonb_build_object('ok', false, 'reason', 'disabled'); end if;
  price := case kind when 'ai' then s.price_ai_cents else s.price_places_cents end;
  if price is null then return jsonb_build_object('ok', false, 'reason', 'no_price'); end if;
  if worst_cents < price then worst_cents := price; end if;
  limit_day := case kind when 'ai' then s.room_daily_ai else s.room_daily_places end;
  select count(*) into used_day from duri_private.api_ledger l
    where l.room_id = target and l.day = today and l.kind = reserve_api_call.kind and l.status <> 'released';
  if used_day >= limit_day then return jsonb_build_object('ok', false, 'reason', 'room_daily'); end if;
  select coalesce(sum(coalesce(l.settled_cents, l.reserved_cents)), 0) into spent from duri_private.api_ledger l
    where l.month = this_month and l.status <> 'released';
  if spent + worst_cents > s.monthly_budget_cents then return jsonb_build_object('ok', false, 'reason', 'monthly'); end if;
  insert into duri_private.api_ledger(request_key, room_id, kind, day, month, reserved_cents)
    values (request_key, target, kind, today, this_month, worst_cents);
  return jsonb_build_object('ok', true);
end; $$;

-- After the upstream answered: replace the worst-case booking with the real cost.
create function public.settle_api_call(request_key text, actual_cents integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  if actual_cents is null or actual_cents < 0 then raise exception 'Invalid api call'; end if;
  update duri_private.api_ledger l set settled_cents = actual_cents, status = 'settled'
    where l.request_key = settle_api_call.request_key and l.status = 'reserved';
end; $$;

-- Only when the request provably never reached the provider (so nothing was charged): give the booking back.
create function public.release_api_call(request_key text) returns void
language plpgsql security definer set search_path='' as $$
begin
  update duri_private.api_ledger l set status = 'released', settled_cents = 0
    where l.request_key = release_api_call.request_key and l.status = 'reserved';
end; $$;

-- What a member may see about their own room: counts for today and a rough month fill level, never prices.
create function public.api_usage(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s duri_private.api_settings; today date := (clock_timestamp() at time zone 'utc')::date;
  this_month date := date_trunc('month', clock_timestamp() at time zone 'utc')::date; spent integer; ai_used integer; places_used integer;
begin
  perform 1 from public.couple_rooms where id = target and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
  select * into s from duri_private.api_settings where id;
  select count(*) filter (where kind = 'ai'), count(*) filter (where kind = 'places') into ai_used, places_used
    from duri_private.api_ledger where room_id = target and day = today and status <> 'released';
  select coalesce(sum(coalesce(settled_cents, reserved_cents)), 0) into spent
    from duri_private.api_ledger where month = this_month and status <> 'released';
  return jsonb_build_object(
    'paidEnabled', s.paid_enabled,
    'aiUsed', ai_used, 'aiLimit', s.room_daily_ai,
    'placesUsed', places_used, 'placesLimit', s.room_daily_places,
    'monthPercent', case when s.monthly_budget_cents = 0 then 100 else least(100, (spent * 100 / s.monthly_budget_cents)) end
  );
end; $$;

revoke all on function public.reserve_api_call(uuid, text, text, integer), public.settle_api_call(text, integer),
  public.release_api_call(text), public.api_usage(uuid) from public, anon, authenticated;
grant execute on function public.reserve_api_call(uuid, text, text, integer), public.settle_api_call(text, integer),
  public.release_api_call(text) to service_role;
grant execute on function public.api_usage(uuid) to authenticated;

commit;
