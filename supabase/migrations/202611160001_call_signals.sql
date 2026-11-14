-- One private event per negotiation step. Use the same receive-only room channel as chat.
begin;
create function public.signal_room_call(target uuid, session_id uuid, kind text, detail text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not duri_private.is_member(target) or
    (select count(*) from public.couple_members where room_id = target) <> 2 then
    raise exception 'Room unavailable';
  end if;
  if session_id is null or kind is null or detail is null or not (
    (kind = 'ring' and detail in ('audio','video')) or
    (kind in ('accept','bye','busy') and detail = '') or
    (kind in ('offer','answer') and octet_length(detail) between 1 and 24000 and starts_with(detail,'v=0'))
  ) then raise exception 'Invalid signal'; end if;
  perform realtime.send(jsonb_build_object('sender',actor,'id',session_id,'kind',kind,'detail',detail),
    'call','room:' || target::text,true);
end; $$;
revoke all on function public.signal_room_call(uuid,uuid,text,text) from public, anon;
grant execute on function public.signal_room_call(uuid,uuid,text,text) to authenticated;
commit;
