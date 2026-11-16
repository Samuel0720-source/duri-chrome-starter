-- P9-1: each partner's birthday, shown with the couple's upcoming days (within 100 days).
--  * Stored on the member's own member_prefs row as 'MM-DD' only: no birth year is kept (an age is not
--    needed to count down to the day).
--  * Each person sets only their own birthday; both partners can read both rows (existing policy).
--  * '02-29' is allowed; the app shows it on 28 February in years without a 29th.
--  * A change rings the room's doorbell with the event 'prefs', like a nickname change.
begin;

alter table public.member_prefs add column birthday text
  check (birthday is null or birthday ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');

-- Sets (or with null / '' clears) my birthday. Returns the saved 'MM-DD' or null.
create function public.set_my_birthday(target uuid, md text) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); clean text := nullif(btrim(coalesce(md, '')), '');
begin
  if clean is not null then
    if clean !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then raise exception 'Invalid birthday'; end if;
    -- 2000 is a leap year, so every real month-day (29 February included) exists in it.
    begin
      perform make_date(2000, split_part(clean, '-', 1)::int, split_part(clean, '-', 2)::int);
    exception when others then
      raise exception 'Invalid birthday';
    end;
  end if;
  perform 1 from public.couple_rooms where id = target and closed_at is null and duri_private.is_member(id);
  if not found then raise exception 'Room unavailable'; end if;
  insert into public.member_prefs(room_id, user_id, birthday) values (target, actor, clean)
    on conflict (room_id, user_id) do update set birthday = excluded.birthday;
  return clean;
end; $$;
revoke all on function public.set_my_birthday(uuid, text) from public, anon, authenticated;
grant execute on function public.set_my_birthday(uuid, text) to authenticated;

drop trigger member_prefs_update_notify on public.member_prefs;
create trigger member_prefs_update_notify after update on public.member_prefs
  for each row when (old.partner_nickname is distinct from new.partner_nickname
    or old.read_upto is distinct from new.read_upto or old.birthday is distinct from new.birthday)
  execute function duri_private.broadcast_room_event('prefs');

commit;
