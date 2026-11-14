-- P7-2: 그림 퀴즈 in English too.
--  * Every bank word gets an English word and English alternatives (word_en, alts_en).
--  * The drawer sees the word in their own language (the screen picks word or wordEn); the guesser may
--    answer in Korean or English. The guesser still never receives the current word in any language.
begin;

alter table duri_private.draw_word_bank add column word_en text;
alter table duri_private.draw_word_bank add column alts_en text[] not null default '{}';
update duri_private.draw_word_bank b set word_en = v.word_en, alts_en = v.alts_en
  from (values
  ('food', '떡볶이', 'tteokbokki', array['rice cake','spicy rice cake']::text[]),
  ('food', '김밥', 'gimbap', array['kimbap']::text[]),
  ('food', '라면', 'ramen', array['ramyeon','noodles']::text[]),
  ('food', '피자', 'pizza', '{}'::text[]),
  ('food', '햄버거', 'hamburger', array['burger']::text[]),
  ('food', '치킨', 'fried chicken', array['chicken']::text[]),
  ('food', '아이스크림', 'ice cream', '{}'::text[]),
  ('food', '케이크', 'cake', '{}'::text[]),
  ('food', '초밥', 'sushi', '{}'::text[]),
  ('food', '김치', 'kimchi', '{}'::text[]),
  ('food', '비빔밥', 'bibimbap', '{}'::text[]),
  ('food', '붕어빵', 'fish-shaped bread', array['bungeoppang','taiyaki']::text[]),
  ('food', '호떡', 'hotteok', array['sweet pancake']::text[]),
  ('food', '샌드위치', 'sandwich', '{}'::text[]),
  ('food', '도넛', 'donut', array['doughnut']::text[]),
  ('food', '수박', 'watermelon', '{}'::text[]),
  ('food', '바나나', 'banana', '{}'::text[]),
  ('food', '딸기', 'strawberry', '{}'::text[]),
  ('food', '계란후라이', 'fried egg', array['egg']::text[]),
  ('food', '커피', 'coffee', '{}'::text[]),
  ('food', '사과', 'apple', '{}'::text[]),
  ('food', '포도', 'grapes', array['grape']::text[]),
  ('food', '귤', 'mandarin', array['tangerine','orange']::text[]),
  ('food', '복숭아', 'peach', '{}'::text[]),
  ('food', '파인애플', 'pineapple', '{}'::text[]),
  ('food', '체리', 'cherry', array['cherries']::text[]),
  ('food', '레몬', 'lemon', '{}'::text[]),
  ('food', '당근', 'carrot', '{}'::text[]),
  ('food', '옥수수', 'corn', '{}'::text[]),
  ('food', '감자', 'potato', '{}'::text[]),
  ('food', '고구마', 'sweet potato', '{}'::text[]),
  ('food', '버섯', 'mushroom', '{}'::text[]),
  ('food', '토마토', 'tomato', '{}'::text[]),
  ('food', '브로콜리', 'broccoli', '{}'::text[]),
  ('food', '오이', 'cucumber', '{}'::text[]),
  ('food', '핫도그', 'hot dog', array['corn dog']::text[]),
  ('food', '감자튀김', 'french fries', array['fries','chips']::text[]),
  ('food', '팝콘', 'popcorn', '{}'::text[]),
  ('food', '솜사탕', 'cotton candy', array['candy floss']::text[]),
  ('food', '사탕', 'candy', array['lollipop']::text[]),
  ('food', '초콜릿', 'chocolate', '{}'::text[]),
  ('food', '쿠키', 'cookie', array['biscuit']::text[]),
  ('food', '마카롱', 'macaron', '{}'::text[]),
  ('food', '와플', 'waffle', '{}'::text[]),
  ('food', '팬케이크', 'pancake', array['pancakes']::text[]),
  ('food', '식빵', 'bread', array['toast']::text[]),
  ('food', '우유', 'milk', '{}'::text[]),
  ('food', '주스', 'juice', '{}'::text[]),
  ('food', '콜라', 'cola', array['coke']::text[]),
  ('food', '빙수', 'bingsu', array['shaved ice']::text[]),
  ('food', '만두', 'dumpling', array['dumplings','mandu']::text[]),
  ('food', '짜장면', 'jjajangmyeon', array['black bean noodles']::text[]),
  ('food', '삼겹살', 'pork belly', array['bbq','meat']::text[]),
  ('food', '소시지', 'sausage', '{}'::text[]),
  ('food', '새우', 'shrimp', array['prawn']::text[]),
  ('food', '오징어', 'squid', '{}'::text[]),
  ('food', '문어', 'octopus', '{}'::text[]),
  ('food', '꼬치', 'skewer', array['kebab']::text[]),
  ('food', '밥', 'rice', '{}'::text[]),
  ('food', '국수', 'noodles', array['noodle']::text[]),
  ('animal', '고양이', 'cat', array['kitty']::text[]),
  ('animal', '강아지', 'dog', array['puppy']::text[]),
  ('animal', '기린', 'giraffe', '{}'::text[]),
  ('animal', '펭귄', 'penguin', '{}'::text[]),
  ('animal', '코끼리', 'elephant', '{}'::text[]),
  ('animal', '토끼', 'rabbit', array['bunny']::text[]),
  ('animal', '사자', 'lion', '{}'::text[]),
  ('animal', '호랑이', 'tiger', '{}'::text[]),
  ('animal', '곰', 'bear', '{}'::text[]),
  ('animal', '원숭이', 'monkey', '{}'::text[]),
  ('animal', '돼지', 'pig', '{}'::text[]),
  ('animal', '오리', 'duck', '{}'::text[]),
  ('animal', '물고기', 'fish', '{}'::text[]),
  ('animal', '거북이', 'turtle', array['tortoise']::text[]),
  ('animal', '나비', 'butterfly', '{}'::text[]),
  ('animal', '상어', 'shark', '{}'::text[]),
  ('animal', '고래', 'whale', '{}'::text[]),
  ('animal', '판다', 'panda', '{}'::text[]),
  ('animal', '개구리', 'frog', '{}'::text[]),
  ('animal', '뱀', 'snake', '{}'::text[]),
  ('animal', '말', 'horse', '{}'::text[]),
  ('animal', '소', 'cow', '{}'::text[]),
  ('animal', '양', 'sheep', array['lamb']::text[]),
  ('animal', '염소', 'goat', '{}'::text[]),
  ('animal', '닭', 'chicken', array['hen','rooster']::text[]),
  ('animal', '병아리', 'chick', '{}'::text[]),
  ('animal', '쥐', 'mouse', array['rat']::text[]),
  ('animal', '햄스터', 'hamster', '{}'::text[]),
  ('animal', '다람쥐', 'squirrel', '{}'::text[]),
  ('animal', '여우', 'fox', '{}'::text[]),
  ('animal', '늑대', 'wolf', '{}'::text[]),
  ('animal', '사슴', 'deer', '{}'::text[]),
  ('animal', '얼룩말', 'zebra', '{}'::text[]),
  ('animal', '하마', 'hippo', array['hippopotamus']::text[]),
  ('animal', '코뿔소', 'rhino', array['rhinoceros']::text[]),
  ('animal', '캥거루', 'kangaroo', '{}'::text[]),
  ('animal', '코알라', 'koala', '{}'::text[]),
  ('animal', '낙타', 'camel', '{}'::text[]),
  ('animal', '악어', 'crocodile', array['alligator']::text[]),
  ('animal', '공룡', 'dinosaur', '{}'::text[]),
  ('animal', '게', 'crab', '{}'::text[]),
  ('animal', '해파리', 'jellyfish', '{}'::text[]),
  ('animal', '불가사리', 'starfish', '{}'::text[]),
  ('animal', '달팽이', 'snail', '{}'::text[]),
  ('animal', '거미', 'spider', '{}'::text[]),
  ('animal', '개미', 'ant', '{}'::text[]),
  ('animal', '벌', 'bee', '{}'::text[]),
  ('animal', '무당벌레', 'ladybug', array['ladybird']::text[]),
  ('animal', '잠자리', 'dragonfly', '{}'::text[]),
  ('animal', '부엉이', 'owl', '{}'::text[]),
  ('animal', '독수리', 'eagle', '{}'::text[]),
  ('animal', '앵무새', 'parrot', '{}'::text[]),
  ('animal', '비둘기', 'pigeon', array['dove']::text[]),
  ('animal', '백조', 'swan', '{}'::text[]),
  ('animal', '홍학', 'flamingo', '{}'::text[]),
  ('animal', '박쥐', 'bat', '{}'::text[]),
  ('animal', '고슴도치', 'hedgehog', '{}'::text[]),
  ('animal', '수달', 'otter', '{}'::text[]),
  ('animal', '물개', 'seal', '{}'::text[]),
  ('animal', '너구리', 'raccoon', '{}'::text[]),
  ('thing', '우산', 'umbrella', '{}'::text[]),
  ('thing', '안경', 'glasses', '{}'::text[]),
  ('thing', '시계', 'clock', array['watch']::text[]),
  ('thing', '자전거', 'bicycle', array['bike']::text[]),
  ('thing', '컵', 'cup', array['mug']::text[]),
  ('thing', '가방', 'bag', array['backpack']::text[]),
  ('thing', '의자', 'chair', '{}'::text[]),
  ('thing', '전화기', 'phone', array['smartphone','telephone']::text[]),
  ('thing', '열쇠', 'key', '{}'::text[]),
  ('thing', '카메라', 'camera', '{}'::text[]),
  ('thing', '연필', 'pencil', '{}'::text[]),
  ('thing', '책', 'book', '{}'::text[]),
  ('thing', '모자', 'hat', array['cap']::text[]),
  ('thing', '신발', 'shoes', array['shoe','sneakers']::text[]),
  ('thing', '선풍기', 'fan', '{}'::text[]),
  ('thing', '침대', 'bed', '{}'::text[]),
  ('thing', '풍선', 'balloon', '{}'::text[]),
  ('thing', '촛불', 'candle', '{}'::text[]),
  ('thing', '기타', 'guitar', '{}'::text[]),
  ('thing', '선물상자', 'gift box', array['gift','present']::text[]),
  ('thing', '가위', 'scissors', '{}'::text[]),
  ('thing', '칫솔', 'toothbrush', '{}'::text[]),
  ('thing', '거울', 'mirror', '{}'::text[]),
  ('thing', '빗', 'comb', array['brush']::text[]),
  ('thing', '숟가락', 'spoon', '{}'::text[]),
  ('thing', '젓가락', 'chopsticks', array['chopstick']::text[]),
  ('thing', '포크', 'fork', '{}'::text[]),
  ('thing', '냄비', 'pot', '{}'::text[]),
  ('thing', '프라이팬', 'frying pan', array['pan']::text[]),
  ('thing', '냉장고', 'fridge', array['refrigerator']::text[]),
  ('thing', '텔레비전', 'tv', array['television']::text[]),
  ('thing', '컴퓨터', 'computer', '{}'::text[]),
  ('thing', '노트북', 'laptop', array['notebook']::text[]),
  ('thing', '헤드폰', 'headphones', array['headset']::text[]),
  ('thing', '리모컨', 'remote', array['remote control']::text[]),
  ('thing', '전구', 'light bulb', array['bulb']::text[]),
  ('thing', '램프', 'lamp', '{}'::text[]),
  ('thing', '소파', 'sofa', array['couch']::text[]),
  ('thing', '책상', 'desk', '{}'::text[]),
  ('thing', '문', 'door', '{}'::text[]),
  ('thing', '창문', 'window', '{}'::text[]),
  ('thing', '계단', 'stairs', array['staircase']::text[]),
  ('thing', '사다리', 'ladder', '{}'::text[]),
  ('thing', '망치', 'hammer', '{}'::text[]),
  ('thing', '못', 'nail', '{}'::text[]),
  ('thing', '자', 'ruler', '{}'::text[]),
  ('thing', '지우개', 'eraser', '{}'::text[]),
  ('thing', '공책', 'notebook', array['note']::text[]),
  ('thing', '편지봉투', 'envelope', '{}'::text[]),
  ('thing', '왕관', 'crown', '{}'::text[]),
  ('thing', '목걸이', 'necklace', '{}'::text[]),
  ('thing', '장갑', 'gloves', array['glove']::text[]),
  ('thing', '양말', 'socks', array['sock']::text[]),
  ('thing', '넥타이', 'tie', array['necktie']::text[]),
  ('thing', '치마', 'skirt', '{}'::text[]),
  ('thing', '바지', 'pants', array['trousers','jeans']::text[]),
  ('thing', '티셔츠', 't-shirt', array['shirt','tee']::text[]),
  ('thing', '비행기', 'airplane', array['plane']::text[]),
  ('thing', '자동차', 'car', '{}'::text[]),
  ('thing', '기차', 'train', '{}'::text[]),
  ('place', '학교', 'school', '{}'::text[]),
  ('place', '병원', 'hospital', '{}'::text[]),
  ('place', '공원', 'park', '{}'::text[]),
  ('place', '바다', 'sea', array['ocean']::text[]),
  ('place', '산', 'mountain', '{}'::text[]),
  ('place', '영화관', 'movie theatre', array['cinema','movie theater']::text[]),
  ('place', '도서관', 'library', '{}'::text[]),
  ('place', '지하철', 'subway', array['metro']::text[]),
  ('place', '놀이공원', 'amusement park', array['theme park']::text[]),
  ('place', '공항', 'airport', '{}'::text[]),
  ('place', '카페', 'cafe', array['coffee shop']::text[]),
  ('place', '편의점', 'convenience store', '{}'::text[]),
  ('place', '해변', 'beach', '{}'::text[]),
  ('place', '캠핑장', 'campsite', array['camping']::text[]),
  ('place', '수영장', 'swimming pool', array['pool']::text[]),
  ('place', '동물원', 'zoo', '{}'::text[]),
  ('place', '박물관', 'museum', '{}'::text[]),
  ('place', '노래방', 'karaoke', '{}'::text[]),
  ('place', '한강', 'han river', array['river']::text[]),
  ('place', '집', 'house', array['home']::text[]),
  ('place', '교회', 'church', '{}'::text[]),
  ('place', '성당', 'cathedral', array['church']::text[]),
  ('place', '절', 'temple', '{}'::text[]),
  ('place', '경찰서', 'police station', '{}'::text[]),
  ('place', '소방서', 'fire station', '{}'::text[]),
  ('place', '우체국', 'post office', '{}'::text[]),
  ('place', '은행', 'bank', '{}'::text[]),
  ('place', '시장', 'market', '{}'::text[]),
  ('place', '마트', 'supermarket', array['grocery store']::text[]),
  ('place', '백화점', 'department store', array['mall']::text[]),
  ('place', '빵집', 'bakery', '{}'::text[]),
  ('place', '식당', 'restaurant', '{}'::text[]),
  ('place', '미용실', 'hair salon', array['salon']::text[]),
  ('place', '헬스장', 'gym', '{}'::text[]),
  ('place', '볼링장', 'bowling alley', array['bowling']::text[]),
  ('place', '스키장', 'ski resort', array['ski']::text[]),
  ('place', '운동장', 'playground', array['field']::text[]),
  ('place', '축구장', 'soccer field', array['football pitch','stadium']::text[]),
  ('place', '야구장', 'baseball stadium', array['ballpark']::text[]),
  ('place', '놀이터', 'playground', array['park']::text[]),
  ('place', '다리', 'bridge', '{}'::text[]),
  ('place', '섬', 'island', '{}'::text[]),
  ('place', '사막', 'desert', '{}'::text[]),
  ('place', '동굴', 'cave', '{}'::text[]),
  ('place', '폭포', 'waterfall', '{}'::text[]),
  ('place', '호수', 'lake', '{}'::text[]),
  ('place', '강', 'river', '{}'::text[]),
  ('place', '숲', 'forest', array['woods']::text[]),
  ('place', '농장', 'farm', '{}'::text[]),
  ('place', '등대', 'lighthouse', '{}'::text[]),
  ('place', '성', 'castle', '{}'::text[]),
  ('place', '피라미드', 'pyramid', '{}'::text[]),
  ('place', '에펠탑', 'eiffel tower', '{}'::text[]),
  ('place', '기차역', 'train station', array['station']::text[]),
  ('place', '버스정류장', 'bus stop', '{}'::text[]),
  ('place', '주유소', 'gas station', array['petrol station']::text[]),
  ('place', '호텔', 'hotel', '{}'::text[]),
  ('place', '사무실', 'office', '{}'::text[]),
  ('place', '화장실', 'bathroom', array['toilet','restroom']::text[]),
  ('place', '부엌', 'kitchen', '{}'::text[]),
  ('date', '손잡기', 'holding hands', array['hand in hand']::text[]),
  ('date', '영화보기', 'watching a movie', array['movie']::text[]),
  ('date', '피크닉', 'picnic', '{}'::text[]),
  ('date', '롤러코스터', 'roller coaster', '{}'::text[]),
  ('date', '불꽃놀이', 'fireworks', '{}'::text[]),
  ('date', '별보기', 'stargazing', array['stars']::text[]),
  ('date', '셀카', 'selfie', '{}'::text[]),
  ('date', '커플링', 'couple rings', array['ring','rings']::text[]),
  ('date', '꽃다발', 'bouquet', array['flowers']::text[]),
  ('date', '하트', 'heart', '{}'::text[]),
  ('date', '포옹', 'hug', '{}'::text[]),
  ('date', '편지', 'letter', array['love letter']::text[]),
  ('date', '드라이브', 'drive', array['road trip']::text[]),
  ('date', '산책', 'walk', array['stroll']::text[]),
  ('date', '스케이트', 'skating', array['ice skating']::text[]),
  ('date', '보드게임', 'board game', '{}'::text[]),
  ('date', '요리하기', 'cooking', '{}'::text[]),
  ('date', '쇼핑', 'shopping', '{}'::text[]),
  ('date', '우산같이쓰기', 'sharing an umbrella', array['umbrella']::text[]),
  ('date', '커플룩', 'matching outfits', array['couple outfit']::text[]),
  ('date', '뽀뽀', 'kiss', array['peck']::text[]),
  ('date', '고백', 'confession', '{}'::text[]),
  ('date', '프러포즈', 'proposal', array['propose']::text[]),
  ('date', '기념일', 'anniversary', '{}'::text[]),
  ('date', '생일파티', 'birthday party', array['birthday']::text[]),
  ('date', '케이블카', 'cable car', '{}'::text[]),
  ('date', '관람차', 'ferris wheel', '{}'::text[]),
  ('date', '자전거타기', 'cycling', array['bike ride']::text[]),
  ('date', '캠핑하기', 'camping', '{}'::text[]),
  ('date', '낚시', 'fishing', '{}'::text[]),
  ('date', '등산', 'hiking', '{}'::text[]),
  ('date', '수영하기', 'swimming', '{}'::text[]),
  ('date', '스키타기', 'skiing', '{}'::text[]),
  ('date', '볼링치기', 'bowling', '{}'::text[]),
  ('date', '노래부르기', 'singing', array['karaoke']::text[]),
  ('date', '춤추기', 'dancing', array['dance']::text[]),
  ('date', '게임하기', 'gaming', array['video games']::text[]),
  ('date', '그림그리기', 'drawing', array['painting']::text[]),
  ('date', '책읽기', 'reading', '{}'::text[]),
  ('date', '낮잠', 'nap', '{}'::text[]),
  ('date', '영상통화', 'video call', '{}'::text[]),
  ('date', '여행가기', 'travel', array['trip']::text[]),
  ('date', '비행기타기', 'flying', array['plane ride']::text[]),
  ('date', '눈사람만들기', 'snowman', '{}'::text[]),
  ('date', '눈싸움', 'snowball fight', '{}'::text[]),
  ('date', '벚꽃구경', 'cherry blossoms', '{}'::text[]),
  ('date', '단풍구경', 'autumn leaves', array['fall foliage']::text[]),
  ('date', '일출보기', 'sunrise', '{}'::text[]),
  ('date', '커플사진', 'couple photo', array['photo']::text[]),
  ('date', '맛집탐방', 'food tour', array['restaurant hopping']::text[]),
  ('date', '빙수먹기', 'eating bingsu', array['bingsu']::text[]),
  ('date', '홈카페', 'home cafe', '{}'::text[]),
  ('date', '퍼즐맞추기', 'puzzle', array['jigsaw']::text[]),
  ('date', '방탈출', 'escape room', '{}'::text[]),
  ('date', '동물원가기', 'zoo trip', array['zoo']::text[]),
  ('date', '놀이공원가기', 'amusement park', '{}'::text[]),
  ('date', '야경보기', 'night view', array['city lights']::text[]),
  ('date', '캠프파이어', 'campfire', '{}'::text[]),
  ('date', '바다수영', 'ocean swim', array['swimming in the sea']::text[]),
  ('date', '줄넘기', 'jump rope', array['skipping']::text[])
  ) as v(category, word, word_en, alts_en)
  where b.category = v.category and b.word = v.word;
alter table duri_private.draw_word_bank alter column word_en set not null;

alter table duri_private.draw_words add column word_en text;
alter table duri_private.draw_words add column alts_en text[] not null default '{}';
-- Rounds that are open right now get the English words too.
update duri_private.draw_words w set word_en = b.word_en, alts_en = b.alts_en
  from public.draw_games g, duri_private.draw_word_bank b
  where g.id = w.game_id and b.word = w.word and (g.category = 'mix' or b.category = g.category);

create or replace function duri_private.draw_pick(gid uuid, n integer) returns void
language plpgsql security definer set search_path='' as $$
declare rid uuid; cat text;
begin
  select room_id, category into rid, cat from public.draw_games where id = gid;
  insert into duri_private.draw_words(game_id, n, word, alts, word_en, alts_en)
    select gid, n, b.word, b.alts, b.word_en, b.alts_en from duri_private.draw_word_bank b
    left join lateral (
      select max(dw.created_at) as last_seen from duri_private.draw_words dw join public.draw_games dg on dg.id = dw.game_id
      where dg.room_id = rid and dw.word = b.word) s on true
    where (cat = 'mix' or b.category = cat)
      and b.word not in (select word from duri_private.draw_words where game_id = gid)
    order by s.last_seen nulls first, random()
    limit 1;
end; $$;

create or replace function public.guess_draw(game uuid, attempt text) returns text
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); gm public.draw_games; w duri_private.draw_words; n text; hit boolean;
begin
  select g.* into gm from public.draw_games g join public.couple_rooms r on r.id = g.room_id
    where g.id = game and r.closed_at is null and duri_private.is_member(g.room_id) for update of g;
  if not found or gm.guesser <> actor then raise exception 'Game unavailable'; end if;
  if gm.result is not null or gm.started_at is null then return 'closed'; end if;
  if gm.deadline_at <= clock_timestamp() then perform duri_private.expire_draw(game); return 'closed'; end if;
  if attempt is null or char_length(btrim(attempt)) not between 1 and 30 then raise exception 'Invalid guess'; end if;
  n := duri_private.draw_norm(attempt);
  if n = '' then raise exception 'Invalid guess'; end if;
  if (select count(*) from public.draw_guesses where game_id = game) >= 400 then raise exception 'Too many guesses'; end if;
  select * into w from duri_private.draw_words where game_id = game and draw_words.n = gm.word_no;
  -- Korean or English, with any listed alternative, spaces and case ignored.
  hit := exists (select 1 from unnest(array[w.word] || w.alts || array[w.word_en] || w.alts_en) c where c is not null and duri_private.draw_norm(c) = n);
  insert into public.draw_guesses(game_id, room_id, player, guess, correct, word_no)
    values (game, gm.room_id, actor, btrim(attempt), hit, gm.word_no);
  if not hit then return 'wrong'; end if;
  update duri_private.draw_words set outcome = 'correct' where game_id = game and draw_words.n = gm.word_no;
  update public.draw_games set score = score + 1, word_no = word_no + 1 where id = game;
  perform duri_private.draw_pick(game, gm.word_no + 1);
  return 'correct';
end; $$;

create or replace function public.draw_state(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); gm public.draw_games; cur text; cur_en text; is_drawer boolean; recs jsonb; words jsonb;
begin
  if not duri_private.is_member(target) then raise exception 'Room unavailable'; end if;
  select * into gm from public.draw_games where room_id = target and result is distinct from 'cancelled' order by created_at desc limit 1;
  if found and gm.result is null and gm.started_at is not null and gm.deadline_at <= clock_timestamp() then
    perform 1 from public.draw_games where id = gm.id for update;
    perform duri_private.expire_draw(gm.id);
    select * into gm from public.draw_games where id = gm.id;
  end if;
  select coalesce(jsonb_object_agg(category, best_score), '{}'::jsonb) into recs from public.draw_records where room_id = target;
  if gm.id is null then
    return jsonb_build_object('game', null, 'nowMs', (extract(epoch from clock_timestamp()) * 1000)::bigint, 'records', recs);
  end if;
  is_drawer := actor = gm.drawer;
  select word, word_en into cur, cur_en from duri_private.draw_words where game_id = gm.id and n = gm.word_no;
  select coalesce(jsonb_agg(jsonb_build_object('n', n, 'word', word, 'wordEn', word_en, 'outcome', outcome) order by n), '[]'::jsonb) into words
    from duri_private.draw_words where game_id = gm.id and (n < gm.word_no or gm.result is not null) and gm.started_at is not null;
  return jsonb_build_object(
    'game', gm.id,
    'category', gm.category,
    'role', case when is_drawer then 'drawer' else 'guesser' end,
    'phase', case when gm.result is not null then 'done' when gm.started_at is null then 'lobby' else 'live' end,
    'meReady', case when is_drawer then gm.drawer_ready else gm.guesser_ready end,
    'partnerReady', case when is_drawer then gm.guesser_ready else gm.drawer_ready end,
    'nowMs', (extract(epoch from clock_timestamp()) * 1000)::bigint,
    'startedMs', (extract(epoch from gm.started_at) * 1000)::bigint,
    'deadlineMs', (extract(epoch from gm.deadline_at) * 1000)::bigint,
    'result', gm.result,
    'score', gm.score,
    'passes', gm.passes,
    'wordNo', gm.word_no,
    'word', case when gm.started_at is not null and gm.result is null and is_drawer then cur else null end,
    'wordEn', case when gm.started_at is not null and gm.result is null and is_drawer then cur_en else null end,
    'words', words,
    'records', recs
  );
end; $$;

commit;
