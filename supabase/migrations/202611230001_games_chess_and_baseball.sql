-- Chess (P9, Thomas) and number baseball (P9-2) were built in parallel. Each migration rewrote the shared
-- new-game functions knowing only its own game, so whichever ran last dropped the other. This one runs after
-- both and knows every game: guess, draw, gomoku, chess, golf, post, poker, baseball.
begin;

alter table duri_private.game_requests
  drop constraint if exists game_requests_kind_check,
  add constraint game_requests_kind_check check (kind in ('guess','draw','gomoku','golf','post','poker','chess','baseball'));

create or replace function duri_private.game_fingerprint(target uuid, kind text) returns text
language plpgsql set search_path='' as $$
declare v text;
begin
  case kind
    when 'guess' then select id::text into v from public.guess_games where room_id=target order by created_at desc limit 1;
    when 'draw' then select id::text into v from public.draw_games where room_id=target order by created_at desc limit 1;
    when 'gomoku' then select id::text into v from public.gomoku_games where room_id=target order by created_at desc limit 1;
    when 'golf' then select id::text into v from public.golf_games where room_id=target order by created_at desc limit 1;
    when 'post' then select revision::text into v from duri_private.postcard_games where room_id=target;
    when 'poker' then select revision::text into v from duri_private.poker_games where room_id=target;
    when 'chess' then select id::text || ':' || move_count::text || ':' || status into v from public.chess_games where room_id=target order by created_at desc limit 1;
    when 'baseball' then select revision::text into v from duri_private.baseball_games where room_id=target;
    else raise exception 'Invalid game';
  end case;
  return coalesce(v, 'idle');
end; $$;

create or replace function public.respond_new_game(target uuid, game_kind text, request_id uuid, accept boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r duri_private.game_requests; g duri_private.poker_games; v integer; cat text; holes integer; drawer uuid; gid uuid; shuffled smallint[];
begin
  perform 1 from public.couple_rooms where id=target and closed_at is null and duri_private.is_member(target) for update;
  if not found then raise exception 'Room unavailable'; end if;
  if (select count(*) from public.couple_members where room_id=target)<>2 then raise exception 'Partner needed'; end if;
  select * into r from duri_private.game_requests where room_id=target and kind=game_kind for update;
  if not found or r.id is distinct from request_id or r.status<>'pending' then return public.game_request_state(target,game_kind); end if;
  if accept is null then raise exception 'Invalid response'; end if;
  if accept and r.requester=auth.uid() then raise exception 'Partner must accept'; end if;
  if not accept then update duri_private.game_requests set status='declined' where room_id=target and kind=game_kind; return public.game_request_state(target,game_kind); end if;
  if r.expires_at<=clock_timestamp() or r.fingerprint<>duri_private.game_fingerprint(target,game_kind) then raise exception 'Game changed; request again'; end if;
  case game_kind
    when 'guess' then
      update public.guess_games set finished_at=clock_timestamp() where room_id=target and finished_at is null;
      perform public.start_guess_game(target);
    when 'draw' then
      select id,category,guesser into gid,cat,drawer from public.draw_games where room_id=target order by created_at desc limit 1 for update;
      if gid is not null then perform duri_private.expire_draw(gid); end if;
      update public.draw_games set finished_at=clock_timestamp(),result='cancelled' where room_id=target and result is null;
      perform public.start_draw_game(target,coalesce(cat,'mix'),case when drawer is null then true else drawer=auth.uid() end);
    when 'gomoku' then
      update public.gomoku_games set status='cancelled',finished_at=clock_timestamp() where room_id=target and status='open';
      perform public.start_gomoku(target);
    when 'chess' then
      update public.chess_games set status='cancelled',finished_at=clock_timestamp() where room_id=target and status='open';
      perform public.start_chess(target);
    when 'golf' then
      select gg.id,gg.holes into gid,holes from public.golf_games gg where room_id=target order by created_at desc limit 1 for update;
      if gid is not null then perform duri_private.advance_golf(gid); end if;
      update public.golf_games set status='cancelled',finished_at=clock_timestamp() where room_id=target and status='open';
      perform public.start_golf(target,coalesce(holes,3));
    when 'post' then
      select array_agg(face::smallint order by gen_random_uuid()) into shuffled from generate_series(0,6) face cross join generate_series(1,2) copy;
      insert into duri_private.postcard_games(room_id,revision,starter,turn_seat,deck) values(target,1,1,1,shuffled)
      on conflict(room_id) do update set revision=postcard_games.revision+1,starter=3-postcard_games.starter,turn_seat=3-postcard_games.starter,deck=excluded.deck,owners=excluded.owners,opened='{}',hide_at=null;
    when 'poker' then
      select * into g from duri_private.poker_games where room_id=target for update;
      v:=coalesce(g.revision,0)+1;
      insert into duri_private.poker_games(room_id,revision,stack_bb,dealer,turn_seat,stacks) values(target,v,r.stack_bb,1,1,array[r.stack_bb*2,r.stack_bb*2])
      on conflict(room_id) do update set revision=v,stack_bb=r.stack_bb,stacks=excluded.stacks,bets='{0,0}',committed='{0,0}',hand=0,dealer=3-poker_games.dealer returning * into g;
      g:=duri_private.poker_deal(g);
      update duri_private.poker_games set (hand,dealer,turn_seat,phase,street,stacks,bets,committed,acted,min_raise,deck,board,hole1,hole2,revealed,winner,last_pot,last_action,ready)=(g.hand,g.dealer,g.turn_seat,g.phase,g.street,g.stacks,g.bets,g.committed,g.acted,g.min_raise,g.deck,g.board,g.hole1,g.hole2,g.revealed,g.winner,g.last_pot,g.last_action,g.ready) where room_id=target;
    when 'baseball' then
      -- A fresh game keeps the record; the other partner starts this time.
      insert into duri_private.baseball_games(room_id,starter,turn_seat) values(target,1,1)
      on conflict(room_id) do update set revision=baseball_games.revision+1,game=baseball_games.game+1,
        starter=3-baseball_games.starter,turn_seat=3-baseball_games.starter,phase='setup',secret1=null,secret2=null,
        guesses='[]'::jsonb,solved='{false,false}',winner=null;
  end case;
  update duri_private.game_requests set status='accepted' where room_id=target and kind=game_kind;
  return public.game_request_state(target,game_kind);
end; $$;

revoke all on function duri_private.game_fingerprint(uuid, text) from public, anon, authenticated;
revoke all on function public.respond_new_game(uuid, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.respond_new_game(uuid, text, uuid, boolean) to authenticated;

commit;
