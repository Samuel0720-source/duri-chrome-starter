# 구성과 결정 기록

## 코드와 데이터 흐름

| 요청 | 경로 | 이유 |
|---|---|---|
| Chrome 툴바에서 기념일 보기 (P1) | 로컬 확장 팝업 → 빌드에 포함된 날짜 함수 → 사용자가 고른 경우에만 확장 전용 저장소 | 팝업을 다시 열어도 선택한 날짜를 볼 수 있다. 첫날을 계산할 때 웹 서버나 방 권한이 필요하지 않다. |
| 작은 창·전체 웹으로 이동 (P1) | 팝업 → 고정된 웹 origin의 `/compact` 또는 `/` → 앱이 fragment 속 첫날·시간대만 검증 → 같은 CalendarPreview | 화면마다 별도 달력 구현이나 별도 로그인 토큰을 만들 필요가 없다. fragment는 HTTP 요청에 들어가지 않는다. P2 로그인 후에는 인증된 웹이 서버의 실제 방을 읽는다. |
| 웹/설치 앱 열기 | Chrome → Vercel의 Next.js App Router → 같은 시작 URL | 한 코드로 큰 탭, 모바일, 작은 독립 창을 지원한다. 초기 PWA는 실제 기념일 계산을 제공한다. |
| 로그인·방 참여 (P2) | Supabase Auth → 사용자 세션 → 사용자 권한의 DB/RPC → PostgreSQL | 방 변경은 트랜잭션으로 확정한다. 인증된 사용자라는 사실과 어느 방에 속하는지는 각각 확인한다. |
| 공동 활동 (P2 이후) | 클라이언트 명령 → 서버 검증 및 DB 커밋 → 방 전용 Supabase Realtime 이벤트 → 필요하면 DB 재조회 | Realtime은 빠른 알림, DB는 확정 상태다. 잠깐 끊겨도 최신 revision으로 복귀한다. |
| AI·장소 (P5) | Next 서버 → 멤버십·동의·예산 예약 → 외부 API → 검증된 응답 → 저장·사용량 정산 | 비밀키와 비용 차단을 서버에서 관리한다. 클라이언트는 허용된 데이터만 받는다. |
| 미니골프 (P6) | 샷 ID·방향·세기·물리 버전 → 짧은 HTTP 요청 1회 → 한 샷의 경로와 정지점 계산 → 커밋 → 두 브라우저가 궤적 재생 | 60fps 서버 루프 없이 두 사람이 동시에 친다. 각자 멈춘 공만 칠 수 있다. |

**호스팅 판단.** Vercel은 2026-10-20 Functions의 WebSocket 정식 지원을 발표했다. 연결은 함수의 최대 실행 시간 제약을 받는다. 여기서는 인증·RLS·Realtime을 한 곳에서 다루고 운영을 단순화하려고 Supabase Realtime을 선택했다. [Vercel 발표](https://vercel.com/changelog/websocket-support-is-now-generally-available) · [지속 연결의 제약](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)

**Chrome과 웹의 경계.** 웹 설치 정보는 `src/app/manifest.ts`, 확장 권한과 팝업은 `extension/manifest.json`이 담당한다. 팝업은 새 탭이나 작은 창을 직접 열고, 설치한 PWA는 루트 URL에서 시작한다. 확장 권한은 선택한 날짜를 이 기기에 기억하는 `storage` 하나다. 인증 쿠키·방 데이터·현재 보고 있는 다른 사이트는 사용하지 않는다. 확장 소스와 웹이 같은 날짜 함수를 사용하므로 윤일 규칙을 한 번만 바꾸면 된다. 공개 배포 시에는 확인된 HTTPS 주소로 확장을 다시 생성한다. [Chrome 팝업](https://developer.chrome.com/docs/extensions/develop/ui/add-popup) · [탭 권한](https://developer.chrome.com/docs/extensions/reference/api/tabs) · [PWA manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)

**배포 주소 결정 (P1).** Deployment Protection은 끄지 않는다. 프리뷰 배포 주소는 배포마다 바뀌고 Vercel 로그인을 요구할 수 있어서, 확장과 휴대폰 확인에는 로그인 없이 열리는 고정 Production 주소 `https://duri-chrome-starter.vercel.app`을 쓴다.
확장은 빌드할 때 받은 주소를 `origin.js`에 고정하므로, 주소가 바뀌면 `npm run extension:build -- <주소>`로 다시 만들어야 한다.

**샷 계약.** 서버에서 코스 버전·정수 또는 고정 timestep·최대 스텝·정지 조건을 고정한다. 원본 입력과 시작 좌표, 샷 ID, 서버 시작 시각, 종료 좌표, 경과 시간, 타수를 저장한다. 샷 ID 유일 제약과 플레이어별 버전 검사를 원자적으로 처리한다. 클라이언트는 같은 물리 모듈/서버 경로로 애니메이션한다. 공끼리는 충돌하지 않는다. 동시에 끝낸 두 플레이어의 홀 완료와 기록 저장은 홀 단위 트랜잭션에서 한 번만 확정한다. 한 홀·세 홀 기록을 구별한다.

## 현재 구현과 향후 코드 위치

실제 파일은 CLAUDE.md를 본다. 확장할 때 `src/features/<기능명>/`에 UI와 명령을 묶고, 도메인 규칙은 `src/core/`, 비밀키를 쓰는 어댑터는 `src/server/`에 둔다. `src/app/api/`의 외부 API 핸들러는 얇게 유지한다. 새 테이블과 권한 변경은 버전이 있는 마이그레이션에 둔다. 단계에서 실제로 필요한 폴더만 만든다.

## 면접에서 설명할 수 있게 남기는 기록

단계별로 복사한다. **사용자 문제 / 데이터가 이동한 경로 / 내가 선택한 방법 / 고려한 대안과 비용 / 실패를 재현한 테스트 / 실측값 또는 아직 측정하지 않은 항목 / 한계**. 아래 답은 직접 두 문장으로 적는다.

- P1. 서울과 밴쿠버에서 같은 시각인데 왜 같은 일수를 보게 하는가?
- P2. 초대 두 건이 동시에 도착했을 때 어느 줄이 두 번째 입장을 막는가?
- P3. 두 답이 공개되기 전에 상대 브라우저에 실린 JSON에는 무엇이 있는가?
- P4. 두 플레이어가 서로의 seek 이벤트를 되쏘면 어떻게 멈추는가?
- P5. 요청 두 건이 동시에 예산의 마지막 몫을 쓰려 할 때 어디서 차단하는가?
- P6. 샷이 성공했지만 HTTP 응답만 사라졌다면 타수가 어떻게 보존되는가?

### P2 기록 · 계정·방·초대·실시간 (2026-11-11)

- **사용자 문제:** 두 사람이 각자 기기에서 같은 방을 보고, 상대가 들어오거나 나가면 바로 알아야 한다. 이메일 링크는 기본 메일 한도(시간당 몇 통) 때문에 많은 사용자를 받기 어렵다.
- **데이터 경로:** Google → Supabase Auth(`/auth/v1/callback`) → 앱 `/auth/callback`(코드 교환, 쿠키) → `/room` 서버 컴포넌트가 RLS로 자기 자리만 읽음 → 초대 `issue_couple_invite`(토큰은 해시만 저장) → `accept_couple_invite`(방 행을 `for update`로 잠금) → `couple_members` 트리거가 `realtime.send`로 `room:<id>` 비공개 주제에 신호 → `realtime.messages` 정책이 그 방 멤버만 듣게 함 → 브라우저 `RoomLive`가 `router.refresh()`.
- **선택한 방법과 대안:** `postgres_changes` 대신 Broadcast를 골랐다. RLS가 켜진 표의 DELETE 이벤트는 필터 없이 기본키가 퍼질 수 있어, 다른 방 사용자 id가 새어 나갈 위험이 있었다. 신호에는 `insert`/`delete`만 담고, 화면은 서버에서 다시 읽는다.
- **실패를 재현한 테스트:** 두 사람이 동시에 같은 초대를 수락(DB 테스트, 한 명만 성공), 제3자 청취 거부·잘못된 주제 거부·나간 뒤 청취 불가(DB), 실제 사이트에서 A 화면이 새로고침 없이 바뀌는지(`FLOW_URL=... npm run test:flow`, 18.9초 통과).
- **한계:** 이메일 로그인은 자체 도메인 SMTP 전까지 시간당 한도가 있다. 실시간 연결이 끊긴 동안의 변화는 다음 새로고침 때 보인다.
- **면접 질문 답 초안(P2):** 두 수락 요청은 `accept_couple_invite` 안의 `couple_rooms ... for update` 잠금에서 줄을 서고, 두 번째 요청은 잠금이 풀린 뒤 이미 자리가 찬 것을 보고 실패한다. 테스트는 두 요청이 실제로 잠금을 기다리는지 `pg_stat_activity`로 확인한다.

### P3 기록 · 방 홈·대화·상대 선택 맞히기 (2026-11-11)

- **사용자 문제:** 두 사람이 같은 방에서 약속·무드·대화·게임을 이어가고, 게임은 상대 답을 미리 볼 수 없어야 재미가 있다.
- **데이터 경로:** 모든 쓰기는 `security definer` RPC(멤버·열린 방 확인) → 트리거가 `realtime.send`로 `room:<id>`에 이름만 있는 신호(`room`/`plans`/`messages`/`guess`) → 브라우저가 신호를 받으면 서버에서 다시 읽음(방 홈은 `router.refresh()`, 대화는 마지막 id 이후 행만, 게임은 `guess_state()`).
- **선택한 방법과 대안:** 게임 답을 공개 표 + RLS로 숨기는 대신 비공개 스키마에 두고 읽기 함수 하나로만 내보냈다. RLS는 “행 단위”라서 같은 행의 상대 답 열만 숨기기 어렵고, 표 API로 직접 읽히는 경로가 남기 때문이다. 대화는 요청 ID(`client_id`)로 재전송 중복을 막았다.
- **실패를 재현한 테스트:** A만 답한 상태에서 B의 `guess_state` JSON에 A의 선택 값이 없는지, 비공개 표 직접 조회가 거부되는지, 신호에 답이 없는지(DB). 같은 요청 ID 재전송이 같은 메시지 id를 돌려주는지, 10초 10개 제한(DB). 실제 사이트에서 두 브라우저로 약속·무드·대화·게임 즉시 반영(흐름 테스트).
- **한계:** 종료 방의 공동 데이터 30일 정리 작업은 아직 없다. 대화는 최근 50개만 처음에 불러온다.
- **면접 질문 답 초안(P3):** 두 답이 공개되기 전 상대 브라우저가 받는 JSON에는 그 라운드의 `partnerAnswered: true`와 `partner: null`만 있다. 실제 선택은 비공개 스키마에만 있고, 둘 다 답한 라운드에서만 `guess_state()`가 꺼내 준다.

### P4-1 기록 · 100초 그림 퀴즈 (2026-11-12)

- **사용자 문제:** 두 사람이 같은 순간에 한 명은 그리고 한 명은 맞히며 놀아야 한다. 정답이 새면 재미가 없고, 시계를 속일 수 있으면 기록이 의미 없다.
- **데이터 경로:** 그리는 사람이 펜을 움직임 → 브라우저가 150ms마다 선 조각을 `add_draw_stroke` RPC로 보냄(조각마다 uuid가 있어 재전송 무시) → DB가 그리는 사람·마감 전·좌표 범위를 확인하고 `draw_strokes`에 저장 → 트리거가 `room:<id>`에 `draw`(내용 없는 신호) 발행 → 맞히는 사람의 브라우저가 120ms 묶음으로 선 목록을 다시 읽어 캔버스를 다시 그림. 답은 `guess_draw` RPC가 DB에서 정규화해 비교한다.
- **선택한 방법과 대안:** (1) 선 좌표를 Realtime 메시지에 직접 실어 보내는 방법은 더 빠르지만 새로고침 뒤 복원이 안 되고 끝난 방에 데이터가 남는지 통제하기 어려워 버렸다. 선을 DB에 저장하고 신호만 보내면 새로고침·다른 기기에서도 같은 그림이 복원된다(비용: 150ms 단위로 끊겨 보임). (2) 제시어 목록을 `src/core`에 두면 브라우저 번들에 정답 후보 전체가 실려서 DB의 비공개 단어장에 두었다. (3) 시간을 브라우저 타이머로 재면 시계 조작이 가능해서 마감은 `clock_timestamp()`로 DB가 정하고, 화면은 DB 시각과의 차이를 보정해 센다.
- **실패를 재현한 테스트:** 맞히는 사람의 상태 JSON·행·신호 어디에도 단어가 없음, 같은 선 조각 재전송 시 한 줄, 같은 정답 두 개를 동시에 보내면 `correct`와 `closed`가 하나씩(결과 한 번), 마감을 과거로 돌린 뒤 정답 제출은 `closed`, 상태 조회만으로도 마감된 판이 한 번 종료, 제3자의 모든 호출 거부(DB). 실제 사이트에서 B가 받은 모든 서버 응답에 단어 없음(흐름 테스트).
- **한계:** 터치 기기에서의 그리기 감각과 서로 먼 네트워크에서의 선 지연은 실측하지 않았다. 마감이 지난 판은 누군가 상태를 읽거나 답을 낼 때 닫힌다(백그라운드 작업 없음).
- **면접 질문 답 초안(P4-1):** 정답 제출과 시간 만료가 같은 순간에 오면 둘 다 `draw_games` 행을 `for update`로 잠그려 하므로 한 쪽이 기다리고, 먼저 간 쪽이 `where result is null` 조건으로 결과를 쓴다. 나중에 들어온 쪽은 이미 결과가 있는 행을 보고 `closed`를 돌려받아서 결과는 한 번만 저장된다.

### P4-2 기록 · YouTube 함께 보기 (2026-11-12) — P4 종료 노트

- **사용자 문제:** 두 사람이 따로 있어도 같은 영상의 같은 장면을 같은 순간에 보고, 한쪽이 멈추거나 건너뛰면 다른 쪽도 따라가야 한다. 도중에 나갔다 들어와도 이어 볼 수 있어야 한다.
- **데이터 경로:** 한 명이 링크 입력 → 브라우저가 형식만 먼저 확인 → `watch_set_video` RPC가 DB에서 다시 해석해 영상 번호 저장(+revision) → 둘 다 `watch_ready` → 두 번째 준비에서 DB가 `playing = true`, 기준 시각 = DB 시각으로 기록(+revision) → 트리거가 `room:<id>`에 `watch` 신호(내용 없음) → 각 브라우저가 `watch_state()`를 다시 읽고 revision 분류(stale/own/apply) → apply만 공식 YouTube IFrame 플레이어를 이동·재생·멈춤. 사람이 누른 조작은 `watch_command`(요청 ID, 위치)로 보내 revision을 올림. 20초마다 `watch_ping`(접속 표시)과 다시 읽기. 마지막 사람이 나가거나 45초 무응답이면 `settle_watch`가 마지막으로 본 시각에 맞춰 멈춤 상태로 저장.
- **선택한 방법과 대안:** (1) 영상 위치를 계속 서로 방송하는 방식은 지연·순서 뒤바뀜이 쌓여 어긋나고 재접속 복원이 안 되므로, “기준 위치 + 기준 시각 + 재생 여부”만 저장하고 현재 위치는 계산한다(재생 중에는 아무도 위치를 계속 보내지 않는다). (2) 브라우저 시계는 틀릴 수 있어 기준 시각을 DB가 정하고 화면은 DB와의 차이를 보정한다. (3) 재생·멈춤을 플레이어 이벤트로만 감지하면 우리가 움직인 것도 사람이 누른 것으로 착각해 서로 되풀이(메아리)하므로, 우리가 플레이어를 움직인 뒤 1.2초는 플레이어 이벤트를 무시하고 상태가 이미 같으면 명령을 보내지 않으며, 서버 revision으로 이미 처리한 것·내가 보낸 것을 거른다.
- **실패를 재현한 테스트:** 같은 요청 ID 재전송이 revision을 한 번만 올림, 150ms 안 연타 거부, 둘 다 나가면 위치 저장·45초 무응답 정지(DB); 로컬 revision 분류·1.0초(정확히 1.0은 유지)/3초 규칙(단위); 두 브라우저에서 준비→재생→멈춤→이동→새로고침 복귀→퍼가기 차단 복구(실제 사이트, 가짜 플레이어).
- **한계:** 광고·버퍼링 신호가 완전하지 않고, 실제 YouTube 플레이어의 이벤트 순서는 사람이 확인해야 한다. 탭이 갑자기 닫히면 ‘나감’ 요청이 취소될 수 있어 45초 뒤 정지로 처리된다.
- **면접 질문 답 초안(P4):** 내가 상대의 ‘이동’ 신호를 받아 플레이어를 움직이면 플레이어가 또 이벤트를 내는데, 이걸 내 조작으로 오해해 다시 보내면 두 화면이 서로를 계속 되돌립니다. 그래서 (a) 서버의 revision이 이미 처리한 것 이하이거나 내가 보낸 명령이면 무시하고, (b) 내가 플레이어를 움직인 직후 1.2초는 플레이어 이벤트를 사람의 조작으로 보지 않으며, (c) 주기 점검은 차이가 1.0초를 넘고 마지막 자동 보정 뒤 3초가 지났을 때만 보정합니다. 사람이 누른 재생·멈춤·이동과 재접속은 쿨다운 없이 바로 적용합니다.

### P5-1 기록 · 비용 차단 원장 (2026-11-13)

- **사용자 문제:** AI·장소 검색은 호출마다 돈이 든다. 키가 새거나 버그·동시 요청이 있어도 정해 둔 예산을 넘겨 청구되면 안 된다.
- **데이터 경로:** Next 서버가 유료 호출 직전에 `reserve_api_call(방, 종류, 요청 키, 최악 비용)`(service_role) → DB가 설정 행을 잠그고 결제 켜짐·가격·방/일 횟수·프로젝트/월 합계를 확인해 `api_ledger`에 예약 기록 → 통과해야만 외부 API 호출 → 응답 뒤 `settle_api_call`(실제 비용) 또는 공급자에 닿지 않았을 때만 `release_api_call`. 화면은 `api_usage`로 횟수·비율만 본다.
- **선택한 방법과 대안:** (1) 앱 메모리나 Redis 카운터는 서버가 여러 개면 서로 못 보고, 재시작하면 사라진다. 모든 서버가 같은 PostgreSQL 원장을 쓰고 한 행 잠금으로 직렬화했다. (2) 호출 뒤에 비용을 세면 이미 늦다. 호출 전 최악 비용을 예약하고 뒤에 정산한다. (3) 클라우드 청구 알림은 막지 않고 알리기만 한다. 그래서 앱 차단(원장)을 중심에 두고 알림·공급자 쿼터는 보조로 둔다. (4) 응답이 안 온 호출을 해제하면 실제로 과금됐을 때 예산이 샌다. 그래서 해제는 공급자에 닿지 않았음이 확실할 때만 하고 나머지는 최악 비용으로 남긴다.
- **실패를 재현한 테스트:** 월 예산이 4센트 남았을 때 4센트짜리 요청 3개를 동시에 보내 정확히 1개만 통과하고 합계가 예산을 넘지 않음, 같은 키 재전송은 한 건, 정산 두 번 불가, 회원·anon·제3자는 직접 호출·표 읽기 거부(DB). 실제 사이트 도우미 탭에서 AI 꺼짐 상태 표시(흐름).
- **한계:** 실제 AI·장소 호출은 아직 연결하지 않았다(가격·예산 미정). 비용 알림(80%)과 공급자 쪽 쿼터는 설정 전이다. 가격 단위는 정수 센트라 아주 싼 호출은 올림해서 보수적으로 센다.
- **면접 질문 답 초안(P5):** 요청 두 건이 동시에 예산의 마지막 몫을 쓰려 하면, 둘 다 `reserve_api_call` 안에서 같은 설정 행을 `for update`로 잠그려 하므로 한 건이 먼저 합계를 확인하고 예약을 기록한 뒤 커밋하고, 기다리던 건은 그 기록이 포함된 합계로 다시 계산해 한도 초과로 거절된다. 호출은 이 예약이 통과한 뒤에만 나간다. 테스트는 3개를 동시에 보내 정확히 1개만 통과함을 확인한다.

### P6-1 기록 · 오목 (2026-11-13)

- **사용자 문제:** 두 사람이 한 판에 한 번씩 번갈아 두는 게임에서, 같은 순간에 눌러도·네트워크가 겹쳐 같은 탭이 두 번 가도 판이 깨지지 않아야 한다.
- **데이터 경로:** 칸 선택(미리보기) → ‘여기에 놓기’ → `play_gomoku(게임, x, y, 요청 id)` → DB가 게임 행을 `for update`로 잠그고(1) 같은 요청 id면 ‘duplicate’, (2) 내 차례인지, (3) 빈 칸인지 확인 → 돌 기록 → 4방향으로 이어진 같은 색 돌 수를 세어 5 이상이면 `won`(승리선 저장, 전적 +1)·225수면 `draw` → 트리거가 `gomoku` 신호(좌표 없음) → 상대 브라우저가 `gomoku_state()`를 다시 읽음.
- **선택한 방법과 대안:** 승리 판정을 브라우저에서 하면 조작·두 화면 불일치가 생겨 DB 함수에 두었다. 돌 위치를 신호에 실어 보내지 않고 상태를 다시 읽는 방식은 새로고침·다른 기기 복원과 같은 경로다. 모바일은 한 번 눌러 미리보고 확인 버튼으로 두게 해 오터치를 막았다.
- **실패를 재현한 테스트:** 같은 사람이 동시에 두 칸을 누르면 하나만 성공(잠금), 같은 요청 id 재전송은 돌 한 개, 끝난 판에 수 거부, 승리 전적이 한 번만 올라감.
- **한계:** 가장 느린 부분은 매 수마다 상태 전체(돌 목록)를 다시 읽는 것(최대 225개라 작음). 무르기·시간제한·금수는 없음.
- **면접 질문 답 초안(P6-1):** 두 사람이 같은 순간에 돌을 놓으려 하면 둘 다 같은 게임 행을 `for update`로 잠그려 하므로 한 명이 먼저 처리된다. 기다린 쪽은 잠금이 풀린 뒤 차례가 바뀐 것을 보고 ‘Not your turn’을 받는다. 같은 탭이 재전송되면 요청 id가 이미 있어 ‘duplicate’로 돌이 한 개만 남는다.

### P6-2 기록 · 동시 미니골프 (2026-11-13)

- **사용자 문제:** 두 사람이 같은 순간에 공을 쳐도 서로의 화면에서 같은 공 움직임을 봐야 하고, 새로고침·재접속해도 공 위치가 같아야 한다.
- **데이터 경로:** 끌기(각도·세기) → `golf_shot(게임, 샷 id, 각도, 세기)` → DB가 내 공 행을 `for update`로 잠그고 ‘이미 컵인/아직 굴러감’을 확인 → 고정 물리(1/60초 단위, 3분할, 마찰 0.985, 반사 75%)로 **한 번만** 전체 경로를 계산 → 경로·끝나는 DB 시각 저장 → 트리거가 `golf` 신호(좌표 없음) → 양쪽 브라우저가 `golf_state()`로 경로를 읽고 **DB 시계 기준**으로 같은 경로를 재생.
- **선택한 방법과 대안:** (1) 각 브라우저가 물리를 돌리면 기기마다 결과가 달라진다(부동소수·프레임 차이). (2) 서버가 60fps로 계속 전송하면 비용·지연이 크다. 그래서 “한 번 계산 → 경로 저장 → 모두 재생”으로 했다. 계산을 Next 서버 대신 DB 함수에 둔 이유는 비밀키가 필요 없고 저장과 한 트랜잭션이며 내장 PostgreSQL로 테스트되기 때문이다. 공끼리는 통과시켜 두 사람의 샷이 서로의 결과를 바꾸지 않게 했다(동시 입력 순서 문제 제거).
- **실패를 재현한 테스트:** 두 사람이 동시에 쳐도 각자 단독 시뮬레이션과 경로가 같음, 같은 샷 id 재전송은 타수 1, 굴러가는 동안 재타격 거부, 재생이 끝나기 전엔 다음 홀로 안 넘어감, 최저 기록은 좋아질 때만 갱신.
- **한계:** 경로는 50ms 간격 표본을 선형 보간(작은 곡률 오차), 코스 3개 고정, 샷 계산은 PL/pgSQL이라 최대 500틱(약 8초) 제한, 각도·세기로 만든 물리 버전은 `physics=1`로 저장해 나중에 바꿀 수 있다.
- **면접 질문 답 초안(P6-2):** “브라우저마다 물리 계산이 달라지면 어떻게 같은 화면을 보장했나요?” — 물리를 브라우저에서 돌리지 않았다. DB가 샷마다 결정적인 시뮬레이션을 한 번 돌려 경로를 저장하고, 두 브라우저는 그 경로를 DB 시계에 맞춰 재생만 한다. 같은 입력은 같은 경로(테스트로 확인)이고, 같은 샷 id 재전송은 저장된 경로를 그대로 돌려준다.

### P6-3 기록 · 피드백 반영 (2026-11-13)

- **끊김을 없앤 방법:** 화면은 "DB 시계 = 내 시계 + 보정값"으로 공 위치를 계산한다. 보정값을 매 응답마다 새로 잡으면 응답이 느린 순간 보정값이 바뀌어 공이 튄다. NTP처럼 왕복 시간이 가장 짧은 측정만 믿고(그때 오차가 가장 작음), 늦게 알게 된 샷은 처음부터 재생해 건너뛰지 않게 했다. 최종 위치는 DB가 정하므로 두 화면의 결과는 같다.
- **"매번 다른 질문/단어":** 무작위만 쓰면 같은 질문이 금방 다시 나온다(생일 문제). 방마다 "마지막으로 본 시각"이 가장 오래된 것부터 고르는 LRU 방식으로, 은행을 한 바퀴 다 돌기 전에는 반복이 없다.
- **그림 퀴즈의 비밀 유지:** 단어가 여러 개가 되어도 현재 단어는 그리는 사람에게만, 지나간 단어는 둘 다에게 보인다. 획과 답은 단어 번호를 가져서 다음 단어는 빈 그림판에서 시작한다.
- **면접 질문 답 초안(P6-3):** "실시간 화면에서 끊김을 어떻게 찾고 고쳤나요?" — 원인을 4개로 나눴다: 시계 보정 흔들림, 친 사람의 추가 왕복, 늦은 신호로 인한 건너뜀, 거친 경로 표본. 각각 최소 왕복 측정, 응답에 재생 시각 포함, 늦은 재생 지연, 매 틱 경로 저장으로 고쳤고, 시계 규칙은 단위 테스트로 고정했다.

### P7 기록 · 언어·애칭·읽음·영상 소스·즉시 예측 (2026-11-13)

- **언어:** 라이브러리 없이 `src/i18n/`. 서버는 `duri_lang` 쿠키 → 없으면 `Accept-Language`로 ko/en을 고르고(`pickLocale`), 같은 사전을 클라이언트에 넘긴다. 영어 사전 타입이 `Record<keyof typeof ko, string>`이라 키가 하나라도 빠지면 타입 검사가 실패한다. 한국어 조사(`{이/가}` 등)는 애칭의 받침을 보고 고른다(`곰돌이가`, `민준이`). 확장 팝업은 웹 쿠키를 못 읽어 Chrome 언어를 따른다.
- **애칭·읽음:** `member_prefs(room, user)` 한 행에 “내가 상대를 부르는 애칭”과 “내가 읽은 마지막 메시지 id”. 직접 쓰기는 막고 RPC만(길이·제어문자 검사, 읽음 위치는 앞으로만·최신 메시지까지만). 변경은 `prefs` 신호 → 상대가 다시 읽음. 화면이 보이고 포커스가 있을 때만 읽음 처리(백그라운드 탭이 “읽음”을 거짓말하지 않게).
- **영상 소스:** DB가 링크를 `(source, ref)`로 해석(`parse_video`)하고 화면은 어댑터 하나로 YouTube·Vimeo·`<video>`를 같은 상태 번호로 다룬다. 그래서 동기화 규칙(위치+경과 시간, 1초 초과 차이만 보정)은 그대로다. 파일은 https와 영상 확장자만 허용.
- **골프 즉시 예측:** 물리를 클라이언트에 복제하면 기기마다 달라질 위험이 있었지만, 계산 순서·상수를 DB와 똑같이 옮기고 270개 샷으로 결과가 같음을 테스트로 고정했다. 그래도 진실은 DB 경로이고, 예측은 “기다리는 시간 숨기기”다.
- **면접 질문 답 초안(P7):** “서버가 정답인 게임에서 입력 지연을 어떻게 없앴나요?” — 클라이언트 예측(client-side prediction). 같은 결정적 물리를 브라우저에서 먼저 돌려 바로 보여 주고, 서버 결과와 같다는 걸 테스트(270/270)로 보장했다. 서버가 거절하면 예측을 버리고 서버 상태로 되돌린다.

### P8 기록 · 앨범·배경·비밀번호·넷플릭스 (2026-11-14)

- **앨범 데이터 흐름:** 사진 고르기 → 브라우저가 1600px·480px JPEG로 다시 그림(GPS 등 카메라 정보 제거) → Storage `room-photos/<방>/<사진>.jpg`에 직접 업로드(정책: 그 방 멤버만) → `add_room_photo`가 파일이 실제로 있는지 확인하고 목록에 추가(200장 제한) → `photos` 신호 → 상대 화면 새로고침. 보여 줄 때는 `/api/photo/<id>`가 로그인한 사람 권한으로 받아서 고정 주소로 돌려줌. 서명 URL은 매번 바뀌어 배경이 매 페이지 다시 받아지는데, 고정 주소는 브라우저가 캐시(`private`)함.
- **배경:** `couple_rooms.wallpaper` 한 칸(테마와 같은 `room` 신호). 사진을 지우면 외래키 `on delete set null`로 배경이 저절로 꺼짐 → "지운 사진이 배경으로 남는" 상태가 생길 수 없음.
- **방을 닫을 때:** DB 함수로는 Storage 파일을 진짜로 지울 수 없어서(메타데이터만 지워짐), 서버 동작이 방이 닫히기 *전에* 멤버 권한으로 폴더를 비우고, 실패하면 방을 닫지 않음.
- **비밀번호:** 8자 이상(앱과 Supabase 둘 다), 72바이트 초과 거부(bcrypt는 72바이트까지만 읽어 나머지를 조용히 버림). 오류는 원문 대신 짧은 코드(`?error=wrong`)로만 주소에 남김. 가입·재설정 응답은 이메일이 있든 없든 같아서 가입 여부를 캐낼 수 없음.
- **넷플릭스:** 넷플릭스 화면은 다른 사이트에 넣을 수 없고(DRM) 계정 공유는 약관 위반이라, Teleparty처럼 각자 자기 탭에서 재생하고 확장이 중계함. 넷플릭스 탭(MAIN 세계 스크립트가 넷플릭스 자체 플레이어로 seek; `<video>.currentTime`을 바꾸면 넷플릭스가 오류로 멈춤) ↔ 다리 스크립트 ↔ 백그라운드 스위치보드 ↔ 함께 보기 페이지 다리 ↔ 페이지의 `netflix` 어댑터. 어댑터가 다른 플레이어와 같은 모양이라 동기화 규칙(리비전·1초 보정)은 그대로. 확장 권한은 여전히 `storage`뿐이고, 스크립트는 `netflix.com/watch/*`와 이 사이트의 `/room/watch*`에서만 돌며, 출시 검사가 다른 페이지를 막음.
- **면접 질문 답 초안(P8):** "직접 제어할 수 없는 서드파티 플레이어(넷플릭스)를 어떻게 동기화했나요?" — 동기화 로직은 건드리지 않고 어댑터 패턴으로 '플레이어'를 추상화했다. 넷플릭스 어댑터는 실제 영상 대신 확장 메시지로 명령을 보내고 상태를 받는다. 메시지는 각 경계(페이지↔확장, 확장↔넷플릭스)에서 명령 종류와 숫자 범위를 다시 검사하고, 가짜 넷플릭스 페이지로 브라우저 테스트를 만들어 계정 없이 CI에서 검증했다.

### 오늘의 엽서와 1:1 통화

방의 현지 날짜로 두 사람에게 같은 질문을 준다. 질문 답과 게임 점수는 사용자가 보내기를 선택한 경우 기존 채팅 쓰기 경로로 저장한다.

채팅 화면의 기존 비공개 구독에 통화 이벤트를 추가했다. `signal_room_call`은 두 자리와 발신자 자격을 확인하고 종류와 크기가 제한된 신호를 발행한다. 양쪽 브라우저가 수락 뒤 마이크를 요청하고 영상 모드에서만 카메라를 요청한다. WebRTC의 암호화된 미디어는 기기 사이로 전송한다. 미디어 서버, TURN 계정 또는 녹화 저장소는 사용하지 않는다. 직접 연결이 막히면 타임아웃 안내를 표시한다. 예상 질문: 두 기기에서 동시에 전화를 걸 때 어떻게 같은 초대 하나를 선택하는가?

### 우편새 정원과 두 사람의 엽서 대결

엽서 7쌍은 매 판 서버가 섞는다. 브라우저는 공개된 카드, 두 사람의 점수와 다음 차례만 받는다. 카드 두 장을 뒤집을 때마다 차례가 바뀌고 틀린 카드는 1.5초 뒤 가려진다. 각 입력은 마지막으로 본 revision을 보내며 방 행을 잠근 뒤 처리한다. 비공개 방송을 받거나 다시 접속하면 같은 상태를 읽는다. 면접 질문으로는 두 기기에서 동시에 누른 재대결이 왜 한 판만 생성하는지 설명해 볼 수 있다.

수신한 음성 트랙은 별도의 오디오 요소에 연결한다. 영상 미리보기는 음소거하고 상대 음성은 한 곳에서만 재생한다. 자동 재생이 막히면 상대 음성을 직접 재생하는 버튼을 표시한다.

### 통화 중계(TURN) · 2026-11-14

- **문제:** 통화가 STUN만 써서, 한쪽이라도 엄격한 네트워크(모바일 데이터, 학교 와이파이 등 대칭형 NAT)에 있으면 두 기기가 서로를 못 찾음 → "연결 중"에서 멈추거나 소리가 안 감. 같은 컴퓨터·같은 와이파이 테스트에서는 늘 통과해서 안 보였음.
- **해결:** 통화마다 `/api/call/ice`가 Cloudflare TURN에서 1시간짜리 중계 자격 증명을 받아 줌(키는 서버 환경 변수에만: `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`). 직접 연결이 되면 브라우저가 알아서 직접 경로를 쓰고, 안 될 때만 중계를 씀. 키가 없거나 Cloudflare가 실패하면 예전처럼 STUN만.
- **외부 유료 호출 기록(CLAUDE.md 규칙):** 이유 = 다른 네트워크 사이 통화 연결. 범위 = 로그인했고 2인 방에 있는 사람만, 통화 1번당 요청 1번, 자격 증명 1시간. 비용 = Cloudflare TURN은 매달 1,000GB까지 무료, 넘으면 GB당 USD 0.05(음성 통화 1시간 ≈ 0.03GB, 영상 ≈ 0.5–1GB). 검사 = `tests/unit/ice.test.mjs`(포트 53 제거·자격 증명 필수), 라이브 흐름의 실제 음성 통화(소리 재생 확인, 연결 경로 표시).
- **면접 질문 답 초안:** "테스트는 통과했는데 실제 사용자 통화가 안 됐던 이유는?" — 테스트 두 브라우저가 같은 기계라 주소 교환(STUN)만으로 연결됐다. 실제 두 사람은 서로 다른 NAT 뒤에 있어 직접 경로가 없을 수 있고, 그때는 미디어를 대신 전달하는 TURN 서버가 필요하다. 연결된 후보 쌍의 종류(host/srflx vs relay)를 화면에 표시해 다음엔 바로 구분할 수 있게 했다.

## P9 · 숫자야구
- 데이터 흐름: 화면 → `baseball_action(방, 본 리비전, 'secret'|'guess', 숫자)` → 서버가 비밀 숫자로 채점하고 리비전 +1 → 트리거가 방 채널에 `baseball` 알림(내용 없음) → 두 화면이 `baseball_state`를 다시 읽음. 상태는 사람마다 다르게 만들어짐: 내 비밀 숫자만 오고, 상대 숫자는 게임이 끝난 뒤에만 옴.
- 설계 이유: 채점을 브라우저에서 하면 상대 비밀 숫자를 브라우저에 보내야 해서 개발자 도구로 볼 수 있음. 그래서 판정은 서버, 화면은 보낸 숫자를 먼저 띄우고(낙관적 표시) 결과만 기다림. 리비전이 다르면 아무것도 바꾸지 않아 두 번 누르기도 안전함.
- 면접 질문: "상대에게 비밀인 정보가 있는 실시간 2인 게임에서, 클라이언트를 믿지 않으면서도 화면이 즉시 반응하게 하려면 어떻게 나누겠는가?"

### Popup chat sizing and startup · 2026-11-23
At widths up to 560px, Chat uses the available viewport minus the measured persistent call dock. The room shell and history can shrink; the composer, question draft and error stay outside the history scroller. History scrolling never scrolls the surrounding document. Incoming messages follow the bottom only when the reader was already near it. Idle toolbar calls use one handoff button; calls still live in the persistent room layout in the separate small window.

The toolbar caches only sanitized route, language and theme in extension-local localStorage, with chrome.storage.local retained for migration. A missing cache gives storage at most 100ms before starting the iframe. Late preferences cannot reload a screen the user is interacting with. Surface messages are deduplicated, avoiding writes on each chat/render mutation. No permissions or credential storage were added. This removes a local startup dependency, not server/network cold-start time.

Review question: why must message scrolling and call-dock resizing never move the composer underneath the dock?

### Compact call launcher (0.5.4)
Both toolbar detach and the embedded call button send the existing open-small message to the packaged worker. The worker owns one popup ID in session storage, explicitly requests normal state and 440×600 outer bounds, then normalizes and reapplies those bounds after creation. Reusing the popup never navigates it, so its media stream survives. A resize failure must not create a second call owner. Native tests assert Chrome window bounds, not an emulated Playwright viewport. No new permissions or stored credentials. Interview question: why must normalizing a fullscreen window happen before applying dimensions, and why must reopening avoid page navigation?

### Toolbar call ownership (0.6.0)
The toolbar no longer redirects a call to a separate window. A packaged offscreen.html embeds only the configured Duri /call-host origin; the authenticated server validates the user and room before mounting CallHost. Normal website calls and the hidden host reuse createCallOwner/CallSession. Popup CallDock uses a disposable controller and same-origin BroadcastChannel scoped to user+room. Video previews use a local WebRTC connection with no STUN servers; remote call audio plays only in the host to avoid duplication. The real microphone, camera and partner peer connection remain in that host after popup closure. Mute/camera state is owned there and restored in the next popup. Logout waits for the bye acknowledgement, then closes the host; member removal ends it; cookies are checked periodically. Idle hosts without viewers are closed after 30 seconds.
New permission: offscreen, for WEB_RTC and USER_MEDIA. Purpose: continue a user-started call without a visible extra window. Scope: one document per Chrome profile, existing Duri origin only, no new browsing hosts or storage of credentials. Camera/microphone still require the website permission; the visible popup asks before sending a start/accept command. The extension bridge carries only fixed ensure/state/close messages, never cookies, access/refresh tokens or partner SDP. Host-origin messages and extension sender IDs are checked. Live tests inspect actual hidden audio through DevTools, close/reopen the toolbar, retain the stream, restore mute state, and assert that no visible popup window is created.
Interview question: why must call ownership survive the popup document, and why must previews never own or stop captured tracks?
