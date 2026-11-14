-- Indexes exposed to the web are zero-based. The hidden deck and seat ownership use PostgreSQL arrays.
begin;

create table duri_private.postcard_games (
  room_id uuid primary key references public.couple_rooms(id) on delete cascade,
  revision integer not null check (revision > 0),
  starter smallint not null check (starter in (1,2)),
  turn_seat smallint not null check (turn_seat in (1,2)),
  deck smallint[] not null check (cardinality(deck) = 14),
  owners smallint[] not null default array_fill(null::smallint, array[14]) check (cardinality(owners) = 14),
  opened integer[] not null default '{}' check (cardinality(opened) <= 2),
  hide_at timestamptz
);
alter table duri_private.postcard_games enable row level security;
revoke all on duri_private.postcard_games from public, anon, authenticated;
create trigger postcard_game_changed after insert or update on duri_private.postcard_games
  for each row execute function duri_private.broadcast_room_event('postcards');

create function public.postcard_state(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  mine smallint;
  g duri_private.postcard_games;
  visible integer[];
  remaining integer;
  points integer[];
  cards jsonb;
begin
  select m.seat into mine from public.couple_members m
    join public.couple_rooms r on r.id=m.room_id
    where m.room_id=target and m.user_id=auth.uid() and r.closed_at is null;
  if mine is null then raise exception 'Room unavailable'; end if;

  select * into g from duri_private.postcard_games where room_id=target;
  if not found then
    return jsonb_build_object('phase','idle','revision',0,'mySeat',mine,'turnSeat',1,
      'scores',array[0,0],'cards',array_fill(null::integer,array[14]),
      'owners',array_fill(null::integer,array[14]),'open','[]'::jsonb,'revealMs',0);
  end if;

  remaining := greatest(0,ceil(1000*extract(epoch from (g.hide_at-clock_timestamp())))::integer);
  visible := case when g.hide_at is null or remaining>0 then g.opened else '{}'::integer[] end;
  select jsonb_agg(case when g.owners[i] is not null or i-1=any(visible) then g.deck[i] end order by i),
         array[(count(*) filter (where g.owners[i]=1) / 2)::integer,
               (count(*) filter (where g.owners[i]=2) / 2)::integer]
    into cards, points from generate_series(1,14) i;
  return jsonb_build_object('phase',case when points[1]+points[2]=7 then 'finished' else 'playing' end,
    'revision',g.revision,'mySeat',mine,'turnSeat',g.turn_seat,'scores',points,
    'cards',cards,'owners',g.owners,'open',visible,'revealMs',remaining);
end; $$;

-- Every mutation takes the room lock first, including when there is no game row yet.
-- Older or repeated requests return the latest board without taking another action.
create function public.postcard_start(target uuid, expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  g duri_private.postcard_games;
  next_starter smallint;
  shuffled smallint[];
begin
  perform 1 from public.couple_rooms where id=target and closed_at is null and duri_private.is_member(target) for update;
  if not found then raise exception 'Room unavailable'; end if;
  if (select count(*) from public.couple_members where room_id=target) <> 2 then raise exception 'Partner needed'; end if;
  select * into g from duri_private.postcard_games where room_id=target;
  if expected_revision is distinct from coalesce(g.revision,0)
    or (g.room_id is not null and array_position(g.owners,null::smallint) is not null) then
    return public.postcard_state(target);
  end if;
  next_starter := coalesce(3-g.starter,1);
  select array_agg(face::smallint order by gen_random_uuid()) into shuffled
    from generate_series(0,6) face cross join generate_series(1,2) copy;
  insert into duri_private.postcard_games(room_id,revision,starter,turn_seat,deck)
    values (target,coalesce(g.revision,0)+1,next_starter,next_starter,shuffled)
    on conflict (room_id) do update set revision=excluded.revision, starter=excluded.starter,
      turn_seat=excluded.turn_seat, deck=excluded.deck, owners=excluded.owners, opened=excluded.opened, hide_at=null;
  return public.postcard_state(target);
end; $$;

create function public.postcard_flip(target uuid, expected_revision integer, card_index integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  mine smallint;
  first_index integer;
  g duri_private.postcard_games;
begin
  perform 1 from public.couple_rooms where id=target and closed_at is null and duri_private.is_member(target) for update;
  if not found then raise exception 'Room unavailable'; end if;
  select seat into mine from public.couple_members where room_id=target and user_id=auth.uid();
  select * into g from duri_private.postcard_games where room_id=target;
  if not found or expected_revision is distinct from g.revision then return public.postcard_state(target); end if;
  if g.turn_seat <> mine then raise exception 'Not your turn'; end if;
  if g.hide_at > clock_timestamp() then raise exception 'Cards still showing'; end if;
  if g.hide_at is not null then g.opened := '{}'; g.hide_at := null; end if;
  if card_index is null or card_index not between 0 and 13
    or g.owners[card_index+1] is not null or card_index=any(g.opened) then raise exception 'Invalid card'; end if;

  first_index := g.opened[1];
  g.opened := array_append(g.opened,card_index);
  if first_index is not null then
    if g.deck[first_index+1]=g.deck[card_index+1] then
      g.owners[first_index+1] := mine;
      g.owners[card_index+1] := mine;
      g.opened := '{}';
    else
      g.hide_at := clock_timestamp()+interval '1.5 seconds';
    end if;
    g.turn_seat := 3-mine;
  end if;
  update duri_private.postcard_games set revision=revision+1, turn_seat=g.turn_seat,
    owners=g.owners, opened=g.opened, hide_at=g.hide_at where room_id=target;
  return public.postcard_state(target);
end; $$;

revoke all on function public.postcard_state(uuid), public.postcard_start(uuid,integer), public.postcard_flip(uuid,integer,integer)
  from public,anon,authenticated;
grant execute on function public.postcard_state(uuid), public.postcard_start(uuid,integer), public.postcard_flip(uuid,integer,integer)
  to authenticated;
commit;
