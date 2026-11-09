-- P2: a signed-in person deletes their own account and every row about them.
-- If they are in a room, the partner gets a notice and the shared room is removed.
begin;
create function public.delete_my_account() returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); rid uuid;
begin
  if actor is null then raise exception 'Sign in required'; end if;
  select room_id into rid from public.couple_members where user_id=actor;
  if rid is not null then
    perform 1 from public.couple_rooms where id=rid for update;
    insert into public.room_notices(recipient,kind)
      select user_id,'partner_left' from public.couple_members where room_id=rid and user_id<>actor;
    -- Cascades remove both seats and any open invites.
    delete from public.couple_rooms where id=rid;
  end if;
  -- Cascades remove this person's notices and Supabase Auth identities and sessions.
  delete from auth.users where id=actor;
end; $$;
revoke all on function public.delete_my_account() from public,anon,authenticated;
grant execute on function public.delete_my_account() to authenticated;
commit;
