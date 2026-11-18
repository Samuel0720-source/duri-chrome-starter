begin;
create table duri_private.poker_games (
 room_id uuid primary key references public.couple_rooms(id) on delete cascade,
 revision integer not null default 0, stack_bb integer not null check(stack_bb in (50,75,100)),
 hand integer not null default 0, dealer integer not null check(dealer in (1,2)), turn_seat integer not null check(turn_seat in (1,2)),
 phase text not null default 'playing' check(phase in ('playing','showdown','finished')),
 street integer not null default 0 check(street between 0 and 3), stacks integer[] not null,
 bets integer[] not null default '{0,0}', committed integer[] not null default '{0,0}',
 acted boolean[] not null default '{false,false}', min_raise integer not null default 2,
 deck integer[] not null default '{}', board integer[] not null default '{}',
 hole1 integer[] not null default '{}', hole2 integer[] not null default '{}',
 revealed boolean not null default false, winner integer check(winner in (0,1,2)),
 last_pot integer not null default 0, last_action text not null default '', ready boolean[] not null default '{false,false}',
 check(cardinality(stacks)=2 and stacks[1]>=0 and stacks[2]>=0),
 check(stacks[1]+stacks[2]+committed[1]+committed[2]=stack_bb*4)
);
alter table duri_private.poker_games enable row level security;
revoke all on duri_private.poker_games from public,anon,authenticated;
create trigger poker_changed after insert or update on duri_private.poker_games for each row execute function duri_private.broadcast_room_event('poker');
-- Card IDs 0..51: rank = id % 13 + 2, suit = id / 13. Compare best five lexicographically.
create function duri_private.poker_rank(cards integer[]) returns integer[] language plpgsql immutable set search_path='' as $$
declare a integer;b integer;c integer;d integer;e integer;five integer[];ranks integer[];counts integer[];sorted integer[];straight integer;flush boolean;val integer[];best integer[]:='{-1}';
begin
 for a in 1..cardinality(cards)-4 loop for b in a+1..cardinality(cards)-3 loop for c in b+1..cardinality(cards)-2 loop for d in c+1..cardinality(cards)-1 loop for e in d+1..cardinality(cards) loop
 five:=array[cards[a],cards[b],cards[c],cards[d],cards[e]];
 select array_agg(r order by n desc,r desc),array_agg(n order by n desc,r desc) into ranks,counts from (select x%13+2 r,count(*)::integer n from unnest(five) x group by 1) q;
 select array_agg(distinct x%13+2 order by x%13+2 desc),count(distinct x/13)=1 into sorted,flush from unnest(five) x;
 straight:=0;
 if cardinality(sorted)=5 then if sorted[1]-sorted[5]=4 then straight:=sorted[1];elsif sorted='{14,5,4,3,2}' then straight:=5;end if;end if;
 if flush and straight>0 then val:=array[8,straight];elsif counts[1]=4 then val:=array[7]||ranks;elsif counts[1]=3 and counts[2]=2 then val:=array[6]||ranks;
 elsif flush then val:=array[5]||sorted;elsif straight>0 then val:=array[4,straight];elsif counts[1]=3 then val:=array[3]||ranks;
 elsif counts[1]=2 and counts[2]=2 then val:=array[2]||ranks;elsif counts[1]=2 then val:=array[1]||ranks;else val:=array[0]||sorted;end if;
 if val>best then best:=val;end if;
 end loop;end loop;end loop;end loop;end loop;return best;
end;$$;
create function duri_private.poker_settle(g duri_private.poker_games, folded integer default 0) returns duri_private.poker_games language plpgsql set search_path='' as $$
declare common integer;pot integer;r1 integer[];r2 integer[];
begin
 common:=least(g.committed[1],g.committed[2]);
 g.stacks[1]:=g.stacks[1]+g.committed[1]-common;g.stacks[2]:=g.stacks[2]+g.committed[2]-common;
 pot:=common*2;g.last_pot:=pot;
 if folded>0 then g.winner:=3-folded;g.revealed:=false;
 else
 -- Burn positions 5,9,11. Future board cards never leave the private schema.
 g.board:=array[g.deck[6],g.deck[7],g.deck[8],g.deck[10],g.deck[12]];
 r1:=duri_private.poker_rank(g.hole1||g.board);r2:=duri_private.poker_rank(g.hole2||g.board);
 g.winner:=case when r1>r2 then 1 when r2>r1 then 2 else 0 end;g.revealed:=true;
 end if;
 if g.winner=0 then g.stacks[1]:=g.stacks[1]+pot/2;g.stacks[2]:=g.stacks[2]+pot/2;g.stacks[3-g.dealer]:=g.stacks[3-g.dealer]+pot%2;
 else g.stacks[g.winner]:=g.stacks[g.winner]+pot;end if;
 g.bets:='{0,0}';g.committed:='{0,0}';g.ready:='{false,false}';
 g.phase:=case when least(g.stacks[1],g.stacks[2])=0 then 'finished' else 'showdown' end;return g;
end;$$;
create function duri_private.poker_deal(g duri_private.poker_games) returns duri_private.poker_games language plpgsql set search_path='' as $$
declare sb integer:=g.dealer;bb integer:=3-g.dealer;
begin
 select array_agg(i order by gen_random_uuid()) into g.deck from generate_series(0,51) i;
 if sb=1 then g.hole1:=array[g.deck[2],g.deck[4]];g.hole2:=array[g.deck[1],g.deck[3]];
 else g.hole2:=array[g.deck[2],g.deck[4]];g.hole1:=array[g.deck[1],g.deck[3]];end if;
 g.board:='{}';g.bets:='{0,0}';g.committed:='{0,0}';g.acted:='{false,false}';g.ready:='{false,false}';
 g.bets[sb]:=least(1,g.stacks[sb]);g.bets[bb]:=least(2,g.stacks[bb]);g.committed:=g.bets;
 g.stacks[1]:=g.stacks[1]-g.bets[1];g.stacks[2]:=g.stacks[2]-g.bets[2];
 g.phase:='playing';g.street:=0;g.turn_seat:=sb;g.min_raise:=2;g.revealed:=false;g.winner:=null;g.hand:=g.hand+1;g.last_pot:=0;g.last_action:='deal';
 if (g.stacks[sb]=0 and g.bets[sb]<=g.bets[bb]) or (g.stacks[bb]=0 and g.bets[bb]<=g.bets[sb]) then g:=duri_private.poker_settle(g);end if;return g;
end;$$;
create function public.poker_state(target uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare mine integer;g duri_private.poker_games;other_cards integer[];due integer;
begin
 select m.seat into mine from public.couple_members m join public.couple_rooms r on r.id=m.room_id where m.room_id=target and m.user_id=auth.uid() and r.closed_at is null;
 if mine is null then raise exception 'Room unavailable';end if;
 select * into g from duri_private.poker_games where room_id=target;
 if not found then return jsonb_build_object('phase','idle','revision',0,'mySeat',mine);end if;
 due:=greatest(0,g.bets[3-mine]-g.bets[mine]);
 if g.revealed then other_cards:=case when mine=1 then g.hole2 else g.hole1 end;end if;
 return jsonb_build_object('phase',g.phase,'revision',g.revision,'mySeat',mine,'stackBB',g.stack_bb,'hand',g.hand,'dealer',g.dealer,'turnSeat',g.turn_seat,'street',g.street,'stacks',g.stacks,'bets',g.bets,'pot',g.committed[1]+g.committed[2],'board',g.board,
 'cards',case when mine=1 then g.hole1 else g.hole2 end,'opponentCards',other_cards,'call',least(due,g.stacks[mine]),'minRaiseTo',greatest(g.bets[1],g.bets[2])+g.min_raise,'maxRaiseTo',g.bets[mine]+g.stacks[mine],'canRaise',g.stacks[3-mine]>0 and g.stacks[mine]>due,'winner',g.winner,'lastPot',g.last_pot,'lastAction',g.last_action,'ready',g.ready,
 'rank',case when g.revealed then (duri_private.poker_rank((case when mine=1 then g.hole1 else g.hole2 end)||g.board))[1] else null end);
end;$$;
create function public.poker_action(target uuid, expected_revision integer, action text, raise_to integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare g duri_private.poker_games;mine integer;other integer;due integer;paid integer;topbet integer;
begin
 perform 1 from public.couple_rooms where id=target and closed_at is null and duri_private.is_member(target) for update;
 if not found then raise exception 'Room unavailable';end if;
 if (select count(*) from public.couple_members where room_id=target)<>2 then raise exception 'Partner needed';end if;
 select seat into mine from public.couple_members where room_id=target and user_id=auth.uid();other:=3-mine;
 select * into g from duri_private.poker_games where room_id=target for update;
 if not found or expected_revision is distinct from g.revision then return public.poker_state(target);end if;
 if action='next' and g.phase='showdown' then
 g.ready[mine]:=true;if g.ready[1] and g.ready[2] then g.dealer:=3-g.dealer;g:=duri_private.poker_deal(g);end if;
 elsif g.phase='playing' and g.turn_seat=mine then
 due:=greatest(0,g.bets[other]-g.bets[mine]);topbet:=greatest(g.bets[1],g.bets[2]);
 if action='fold' then g:=duri_private.poker_settle(g,mine);
 else
 if action='check' then if due<>0 then raise exception 'Must call or fold';end if;paid:=0;
 elsif action='call' then paid:=least(due,g.stacks[mine]);
 elsif action='raise' then
 if raise_to is null or raise_to<=topbet or raise_to>g.bets[mine]+g.stacks[mine] or g.stacks[other]=0 then raise exception 'Invalid raise';end if;
 if raise_to-topbet<g.min_raise and raise_to<>g.bets[mine]+g.stacks[mine] then raise exception 'Minimum raise';end if;
 if raise_to-topbet>=g.min_raise then g.min_raise:=raise_to-topbet;end if;paid:=raise_to-g.bets[mine];g.acted[other]:=false;
 else raise exception 'Invalid action';end if;
 g.stacks[mine]:=g.stacks[mine]-paid;g.bets[mine]:=g.bets[mine]+paid;g.committed[mine]:=g.committed[mine]+paid;g.acted[mine]:=true;
 if least(g.stacks[1],g.stacks[2])=0 and ((g.stacks[mine]=0 and g.bets[mine]<=g.bets[other]) or (g.stacks[other]=0 and g.bets[other]<=g.bets[mine])) then g:=duri_private.poker_settle(g);
 elsif g.acted[1] and g.acted[2] and g.bets[1]=g.bets[2] then
 if g.street=3 then g:=duri_private.poker_settle(g);
 else g.street:=g.street+1;g.bets:='{0,0}';g.acted:='{false,false}';g.min_raise:=2;g.turn_seat:=3-g.dealer;
 g.board:=case g.street when 1 then array[g.deck[6],g.deck[7],g.deck[8]] when 2 then array[g.deck[6],g.deck[7],g.deck[8],g.deck[10]] else array[g.deck[6],g.deck[7],g.deck[8],g.deck[10],g.deck[12]] end;end if;
 else g.turn_seat:=other;end if;end if;g.last_action:=action;
 else raise exception 'Not your turn';end if;
 g.revision:=g.revision+1;
 update duri_private.poker_games set (revision,hand,dealer,turn_seat,phase,street,stacks,bets,committed,acted,min_raise,deck,board,hole1,hole2,revealed,winner,last_pot,last_action,ready)=(g.revision,g.hand,g.dealer,g.turn_seat,g.phase,g.street,g.stacks,g.bets,g.committed,g.acted,g.min_raise,g.deck,g.board,g.hole1,g.hole2,g.revealed,g.winner,g.last_pot,g.last_action,g.ready) where room_id=target;
 return public.poker_state(target);
end;$$;
revoke all on function duri_private.poker_rank(integer[]),duri_private.poker_settle(duri_private.poker_games,integer),duri_private.poker_deal(duri_private.poker_games) from public,anon,authenticated;
revoke all on function public.poker_state(uuid),public.poker_action(uuid,integer,text,integer) from public,anon,authenticated;
grant execute on function public.poker_state(uuid),public.poker_action(uuid,integer,text,integer) to authenticated;

-- Consent replaces an ongoing match, preserving completed records and question history.
alter table public.gomoku_games drop constraint gomoku_games_status_check;
alter table public.gomoku_games add constraint gomoku_games_status_check check(status in ('open','won','draw','cancelled'));
create table duri_private.game_requests (
 room_id uuid references public.couple_rooms(id) on delete cascade,
 kind text check(kind in ('guess','draw','gomoku','golf','post','poker')),
 id uuid not null default gen_random_uuid(), requester uuid not null references auth.users(id) on delete cascade,
 fingerprint text not null, stack_bb integer not null default 50 check(stack_bb in (50,75,100)),
 status text not null default 'pending' check(status in ('pending','accepted','declined')),
 expires_at timestamptz not null default clock_timestamp()+interval '2 minutes', primary key(room_id,kind)
);
alter table duri_private.game_requests enable row level security;
revoke all on duri_private.game_requests from public,anon,authenticated;
create trigger rematch_changed after insert or update on duri_private.game_requests for each row execute function duri_private.broadcast_room_event('rematch');
create function duri_private.game_fingerprint(target uuid,kind text) returns text language plpgsql set search_path='' as $$
declare v text;
begin
 case kind
 when 'guess' then select id::text into v from public.guess_games where room_id=target order by created_at desc limit 1;
 when 'draw' then select id::text into v from public.draw_games where room_id=target order by created_at desc limit 1;
 when 'gomoku' then select id::text into v from public.gomoku_games where room_id=target order by created_at desc limit 1;
 when 'golf' then select id::text into v from public.golf_games where room_id=target order by created_at desc limit 1;
 when 'post' then select revision::text into v from duri_private.postcard_games where room_id=target;
 when 'poker' then select revision::text into v from duri_private.poker_games where room_id=target;
 else raise exception 'Invalid game';end case;return coalesce(v,'idle');
end;$$;
create function public.game_request_state(target uuid, game_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r duri_private.game_requests;
begin
 if not duri_private.is_member(target) then raise exception 'Room unavailable';end if;
 select * into r from duri_private.game_requests where room_id=target and kind=game_kind;
 if not found then return jsonb_build_object('id',null);end if;
 return jsonb_build_object('id',r.id,'mine',r.requester=auth.uid(),'stackBB',r.stack_bb,'status',r.status,
 'active',r.status='pending' and r.expires_at>clock_timestamp() and r.fingerprint=duri_private.game_fingerprint(target,game_kind));
end;$$;
create function public.request_new_game(target uuid, game_kind text, stack_bb integer default 50) returns jsonb language plpgsql security definer set search_path='' as $$
declare r duri_private.game_requests;fp text;
begin
 perform 1 from public.couple_rooms where id=target and closed_at is null and duri_private.is_member(target) for update;
 if not found then raise exception 'Room unavailable';end if;
 if (select count(*) from public.couple_members where room_id=target)<>2 then raise exception 'Partner needed';end if;
 if stack_bb is null or stack_bb not in (50,75,100) then raise exception 'Invalid stack';end if;
 fp:=duri_private.game_fingerprint(target,game_kind);
 select * into r from duri_private.game_requests where room_id=target and kind=game_kind;
 if r.status='pending' and r.expires_at>clock_timestamp() and r.fingerprint=fp then return public.game_request_state(target,game_kind);end if;
 insert into duri_private.game_requests(room_id,kind,requester,fingerprint,stack_bb) values(target,game_kind,auth.uid(),fp,stack_bb)
 on conflict(room_id,kind) do update set id=excluded.id,requester=excluded.requester,fingerprint=excluded.fingerprint,stack_bb=excluded.stack_bb,status='pending',expires_at=excluded.expires_at;
 return public.game_request_state(target,game_kind);
end;$$;
create function public.respond_new_game(target uuid, game_kind text, request_id uuid, accept boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare r duri_private.game_requests;g duri_private.poker_games;v integer;cat text;holes integer;drawer uuid;gid uuid;shuffled smallint[];
begin
 perform 1 from public.couple_rooms where id=target and closed_at is null and duri_private.is_member(target) for update;
 if not found then raise exception 'Room unavailable';end if;
 if (select count(*) from public.couple_members where room_id=target)<>2 then raise exception 'Partner needed';end if;
 select * into r from duri_private.game_requests where room_id=target and kind=game_kind for update;
 if not found or r.id is distinct from request_id or r.status<>'pending' then return public.game_request_state(target,game_kind);end if;
 if accept is null then raise exception 'Invalid response';end if;
 if accept and r.requester=auth.uid() then raise exception 'Partner must accept';end if;
 if not accept then update duri_private.game_requests set status='declined' where room_id=target and kind=game_kind;return public.game_request_state(target,game_kind);end if;
 if r.expires_at<=clock_timestamp() or r.fingerprint<>duri_private.game_fingerprint(target,game_kind) then raise exception 'Game changed; request again';end if;
 case game_kind
 when 'guess' then
  update public.guess_games set finished_at=clock_timestamp() where room_id=target and finished_at is null;
  perform public.start_guess_game(target);
 when 'draw' then
  select id,category,guesser into gid,cat,drawer from public.draw_games where room_id=target order by created_at desc limit 1 for update;
  if gid is not null then perform duri_private.expire_draw(gid);end if;
  update public.draw_games set finished_at=clock_timestamp(),result='cancelled' where room_id=target and result is null;
  perform public.start_draw_game(target,coalesce(cat,'mix'),case when drawer is null then true else drawer=auth.uid() end);
 when 'gomoku' then
  update public.gomoku_games set status='cancelled',finished_at=clock_timestamp() where room_id=target and status='open';
  perform public.start_gomoku(target);
 when 'golf' then
  select gg.id,gg.holes into gid,holes from public.golf_games gg where room_id=target order by created_at desc limit 1 for update;
  if gid is not null then perform duri_private.advance_golf(gid);end if;
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
 end case;
 update duri_private.game_requests set status='accepted' where room_id=target and kind=game_kind;
 return public.game_request_state(target,game_kind);
end;$$;
revoke all on function duri_private.game_fingerprint(uuid,text) from public,anon,authenticated;
revoke all on function public.game_request_state(uuid,text),public.request_new_game(uuid,text,integer),public.respond_new_game(uuid,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.game_request_state(uuid,text),public.request_new_game(uuid,text,integer),public.respond_new_game(uuid,text,uuid,boolean) to authenticated;
commit;
