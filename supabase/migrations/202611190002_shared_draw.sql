-- Collaborative shared drawing board ("둘이 낙서장") + Chrome extension bridge tokens.
--  * Web users authenticate via auth.uid() + couple_members RLS helpers.
--  * The Chrome extension authenticates via a scoped 64-hex token stored hashed (sha256) in duri_private,
--    and can only write/read while the user remains an active member of an open room.
begin;

create table public.sketch_boards (
  room_id uuid primary key references public.couple_rooms(id) on delete cascade,
  bg text not null default 'paper' check (bg in ('paper', 'blush', 'mint', 'night')),
  revision integer not null default 0,
  last_seq bigint not null default 0,
  reset_rev integer not null default 0,
  updated_at timestamptz not null default clock_timestamp()
);

create table public.sketch_strokes (
  id bigserial primary key,
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  seq bigint not null,
  stroke_id uuid not null,
  segment_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('pen', 'erase', 'stamp')),
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  width smallint not null check (width between 1 and 80),
  points jsonb not null,
  stamp text check (stamp is null or stamp in ('❤️', '⭐', '🌸', '✨', '🐾', '💌')),
  created_at timestamptz not null default clock_timestamp(),
  unique (room_id, segment_id)
);
create index on public.sketch_strokes(room_id, seq, id);
create index on public.sketch_strokes(room_id, user_id, id desc);

create table duri_private.sketch_bridge_tokens (
  token_hash bytea primary key,
  room_id uuid not null references public.couple_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '90 days'),
  revoked_at timestamptz
);
create index on duri_private.sketch_bridge_tokens(room_id, user_id);

alter table public.sketch_boards enable row level security;
alter table public.sketch_strokes enable row level security;
alter table duri_private.sketch_bridge_tokens enable row level security;
revoke all on public.sketch_boards, public.sketch_strokes, duri_private.sketch_bridge_tokens from public, anon, authenticated;

create function duri_private.sketch_validate_stroke(
  kind text, pen_color text, pen_width smallint, pts jsonb, stamp_txt text
) returns void
language plpgsql immutable set search_path='' as $$
begin
  if kind = 'stamp' then
    if stamp_txt is null or stamp_txt not in ('❤️', '⭐', '🌸', '✨', '🐾', '💌')
       or pen_width is null or pen_width not between 16 and 80
       or pts is null or jsonb_typeof(pts) <> 'array' or jsonb_array_length(pts) <> 1 then
      raise exception 'Invalid stroke';
    end if;
    if exists (select 1 from jsonb_array_elements(pts) e where not (
      case when jsonb_typeof(e) = 'array' and jsonb_array_length(e) = 2
                and jsonb_typeof(e->0) = 'number' and jsonb_typeof(e->1) = 'number'
           then (e->>0)::numeric between 0 and 1000 and (e->>1)::numeric between 0 and 750
           else false end)) then
      raise exception 'Invalid stroke';
    end if;
    return;
  end if;

  if kind is null or kind not in ('pen', 'erase')
     or pen_color is null or pen_color !~ '^#[0-9a-f]{6}$'
     or pen_width is null or pen_width not between 1 and 48
     or pts is null or jsonb_typeof(pts) <> 'array' or jsonb_array_length(pts) not between 1 and 250 then
    raise exception 'Invalid stroke';
  end if;

  if exists (select 1 from jsonb_array_elements(pts) e where not (
    case when jsonb_typeof(e) = 'array' and jsonb_array_length(e) = 2
              and jsonb_typeof(e->0) = 'number' and jsonb_typeof(e->1) = 'number'
         then (e->>0)::numeric between 0 and 1000 and (e->>1)::numeric between 0 and 750
         else false end)) then
    raise exception 'Invalid stroke';
  end if;
end; $$;

create function duri_private.sketch_state_for(
  target uuid, actor uuid, since_seq bigint default 0, since_rev integer default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  b public.sketch_boards;
  incremental boolean;
  rows jsonb;
  has_tok boolean;
begin
  insert into public.sketch_boards(room_id) values (target) on conflict (room_id) do nothing;
  select * into b from public.sketch_boards where room_id = target;
  incremental := since_rev is not null and since_rev >= b.reset_rev and coalesce(since_seq, 0) > 0;
  select coalesce(jsonb_agg(jsonb_build_object(
    'seq', s.seq,
    'stroke', s.stroke_id,
    'segment', s.segment_id,
    'by', case when s.user_id = actor then 'me' else 'partner' end,
    'kind', s.kind,
    'color', s.color,
    'width', s.width,
    'points', s.points,
    'stamp', s.stamp
  ) order by s.seq, s.id), '[]'::jsonb)
  into rows
  from public.sketch_strokes s
  where s.room_id = target
    and (not incremental or s.seq > since_seq);

  select exists(
    select 1 from duri_private.sketch_bridge_tokens t
    where t.room_id = target and t.user_id = actor and t.revoked_at is null and t.expires_at > clock_timestamp()
  ) into has_tok;

  return jsonb_build_object(
    'bg', b.bg,
    'revision', b.revision,
    'latestSeq', b.last_seq,
    'incremental', incremental,
    'strokes', rows,
    'hasExtensionToken', has_tok
  );
end; $$;

create function duri_private.sketch_add_for(
  target uuid, actor uuid, stroke_id uuid, segment_id uuid,
  kind text, pen_color text, pen_width smallint, pts jsonb, stamp_txt text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  b public.sketch_boards;
  use_color text := coalesce(nullif(pen_color, ''), '#2a1f26');
  next_seq bigint;
begin
  if stroke_id is null or segment_id is null then raise exception 'Invalid stroke'; end if;
  perform duri_private.sketch_validate_stroke(kind, use_color, pen_width, pts, stamp_txt);
  insert into public.sketch_boards(room_id) values (target) on conflict (room_id) do nothing;
  select * into b from public.sketch_boards where room_id = target for update;

  if exists (select 1 from public.sketch_strokes s where s.room_id = target and s.segment_id = sketch_add_for.segment_id) then
    return jsonb_build_object('seq', b.last_seq, 'revision', b.revision, 'duplicate', true);
  end if;

  if (select count(*) from public.sketch_strokes where room_id = target) >= 3000 then
    raise exception 'Too many strokes';
  end if;

  next_seq := b.last_seq + 1;
  insert into public.sketch_strokes(room_id, seq, stroke_id, segment_id, user_id, kind, color, width, points, stamp)
    values (target, next_seq, stroke_id, segment_id, actor, kind, use_color, pen_width, pts,
      case when kind = 'stamp' then stamp_txt else null end);

  update public.sketch_boards set
    revision = revision + 1,
    last_seq = next_seq,
    updated_at = clock_timestamp()
  where room_id = target;

  return jsonb_build_object('seq', next_seq, 'revision', b.revision + 1);
end; $$;

create function duri_private.sketch_undo_for(target uuid, actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  b public.sketch_boards;
  sid uuid;
begin
  insert into public.sketch_boards(room_id) values (target) on conflict (room_id) do nothing;
  select * into b from public.sketch_boards where room_id = target for update;

  select s.stroke_id into sid from public.sketch_strokes s
    where s.room_id = target and s.user_id = actor
    order by s.seq desc, s.id desc limit 1;

  if sid is not null then
    delete from public.sketch_strokes where room_id = target and user_id = actor and stroke_id = sid;
    update public.sketch_boards set
      revision = revision + 1,
      reset_rev = revision + 1,
      updated_at = clock_timestamp()
    where room_id = target;
  end if;

  return duri_private.sketch_state_for(target, actor, 0, null);
end; $$;

create function duri_private.sketch_clear_for(target uuid, actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.sketch_boards;
begin
  insert into public.sketch_boards(room_id) values (target) on conflict (room_id) do nothing;
  select * into b from public.sketch_boards where room_id = target for update;
  delete from public.sketch_strokes where room_id = target;
  update public.sketch_boards set
    revision = revision + 1,
    reset_rev = revision + 1,
    updated_at = clock_timestamp()
  where room_id = target;
  return duri_private.sketch_state_for(target, actor, 0, null);
end; $$;

create function duri_private.sketch_bg_for(target uuid, actor uuid, next_bg text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if next_bg is null or next_bg not in ('paper', 'blush', 'mint', 'night') then
    raise exception 'Invalid mood';
  end if;
  insert into public.sketch_boards(room_id, bg) values (target, next_bg)
    on conflict (room_id) do update set bg = next_bg, revision = public.sketch_boards.revision + 1, updated_at = clock_timestamp();
  return duri_private.sketch_state_for(target, actor, 0, null);
end; $$;

create function duri_private.sketch_resolve_token(raw_token text)
returns table(room_id uuid, user_id uuid)
language plpgsql security definer set search_path='' as $$
declare
  digest bytea;
  rid uuid;
  uid uuid;
begin
  if raw_token is null or raw_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Bridge token unavailable';
  end if;
  digest := sha256(convert_to(raw_token, 'UTF8'));
  select t.room_id, t.user_id into rid, uid
    from duri_private.sketch_bridge_tokens t
    join public.couple_rooms r on r.id = t.room_id
    join public.couple_members m on m.room_id = t.room_id and m.user_id = t.user_id
    where t.token_hash = digest
      and t.revoked_at is null
      and t.expires_at > clock_timestamp()
      and r.closed_at is null
    for update of r;
  if not found then
    raise exception 'Bridge token unavailable';
  end if;
  return query select rid, uid;
end; $$;

revoke all on function
  duri_private.sketch_validate_stroke(text, text, smallint, jsonb, text),
  duri_private.sketch_state_for(uuid, uuid, bigint, integer),
  duri_private.sketch_add_for(uuid, uuid, uuid, uuid, text, text, smallint, jsonb, text),
  duri_private.sketch_undo_for(uuid, uuid),
  duri_private.sketch_clear_for(uuid, uuid),
  duri_private.sketch_bg_for(uuid, uuid, text),
  duri_private.sketch_resolve_token(text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- Web RPCs (authenticated)
create function public.sketch_state(target uuid, since_seq bigint default 0, since_rev integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
  return duri_private.sketch_state_for(target, actor, since_seq, since_rev);
end; $$;

create function public.add_sketch_stroke(
  target uuid, stroke_id uuid, segment_id uuid, kind text, pen_color text, pen_width smallint, pts jsonb, stamp_txt text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  return duri_private.sketch_add_for(target, actor, stroke_id, segment_id, kind, pen_color, pen_width, pts, stamp_txt);
end; $$;

create function public.undo_sketch_stroke(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  return duri_private.sketch_undo_for(target, actor);
end; $$;

create function public.clear_sketch_board(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  return duri_private.sketch_clear_for(target, actor);
end; $$;

create function public.set_sketch_bg(target uuid, next_bg text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  return duri_private.sketch_bg_for(target, actor, next_bg);
end; $$;

create function public.issue_sketch_token(target uuid) returns text
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  raw_token text;
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id) for update;
  if not found then raise exception 'Room unavailable'; end if;
  update duri_private.sketch_bridge_tokens
    set revoked_at = clock_timestamp()
    where room_id = target and user_id = actor and revoked_at is null;
  raw_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into duri_private.sketch_bridge_tokens(token_hash, room_id, user_id)
    values (sha256(convert_to(raw_token, 'UTF8')), target, actor);
  return raw_token;
end; $$;

create function public.revoke_sketch_token(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
  update duri_private.sketch_bridge_tokens
    set revoked_at = clock_timestamp()
    where room_id = target and user_id = actor and revoked_at is null;
end; $$;

-- ---------------------------------------------------------------- Chrome Extension Bridge RPCs
create function public.sketch_bridge_state(raw_token text, since_seq bigint default 0, since_rev integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare resolved record;
begin
  select * into resolved from duri_private.sketch_resolve_token(raw_token);
  return duri_private.sketch_state_for(resolved.room_id, resolved.user_id, since_seq, since_rev);
end; $$;

create function public.sketch_bridge_stroke(
  raw_token text, stroke_id uuid, segment_id uuid, kind text, pen_color text, pen_width smallint, pts jsonb, stamp_txt text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare resolved record;
begin
  select * into resolved from duri_private.sketch_resolve_token(raw_token);
  return duri_private.sketch_add_for(resolved.room_id, resolved.user_id, stroke_id, segment_id, kind, pen_color, pen_width, pts, stamp_txt);
end; $$;

create function public.sketch_bridge_undo(raw_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare resolved record;
begin
  select * into resolved from duri_private.sketch_resolve_token(raw_token);
  return duri_private.sketch_undo_for(resolved.room_id, resolved.user_id);
end; $$;

create function public.sketch_bridge_clear(raw_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare resolved record;
begin
  select * into resolved from duri_private.sketch_resolve_token(raw_token);
  return duri_private.sketch_clear_for(resolved.room_id, resolved.user_id);
end; $$;

create function public.sketch_bridge_bg(raw_token text, next_bg text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare resolved record;
begin
  select * into resolved from duri_private.sketch_resolve_token(raw_token);
  return duri_private.sketch_bg_for(resolved.room_id, resolved.user_id, next_bg);
end; $$;

revoke all on function
  public.sketch_state(uuid, bigint, integer),
  public.add_sketch_stroke(uuid, uuid, uuid, text, text, smallint, jsonb, text),
  public.undo_sketch_stroke(uuid),
  public.clear_sketch_board(uuid),
  public.set_sketch_bg(uuid, text),
  public.issue_sketch_token(uuid),
  public.revoke_sketch_token(uuid),
  public.sketch_bridge_state(text, bigint, integer),
  public.sketch_bridge_stroke(text, uuid, uuid, text, text, smallint, jsonb, text),
  public.sketch_bridge_undo(text),
  public.sketch_bridge_clear(text),
  public.sketch_bridge_bg(text, text)
  from public, anon, authenticated;

grant execute on function
  public.sketch_state(uuid, bigint, integer),
  public.add_sketch_stroke(uuid, uuid, uuid, text, text, smallint, jsonb, text),
  public.undo_sketch_stroke(uuid),
  public.clear_sketch_board(uuid),
  public.set_sketch_bg(uuid, text),
  public.issue_sketch_token(uuid),
  public.revoke_sketch_token(uuid)
  to authenticated;

grant execute on function
  public.sketch_bridge_state(text, bigint, integer),
  public.sketch_bridge_stroke(text, uuid, uuid, text, text, smallint, jsonb, text),
  public.sketch_bridge_undo(text),
  public.sketch_bridge_clear(text),
  public.sketch_bridge_bg(text, text)
  to anon, authenticated;

create trigger sketch_boards_notify
  after insert or update on public.sketch_boards
  for each row execute function duri_private.broadcast_room_event('sketch');

commit;
