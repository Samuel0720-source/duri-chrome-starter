# 현재 상태 · 다음 세션이 처음 읽을 파일

**현재 단계는 P8(앨범·방 배경·비밀번호 로그인·넷플릭스 같이 보기, 도우미는 잠시 뺌)입니다. 맨 아래 P8 기록이 최신입니다.** (아래 표와 P1 기록은 당시 기록)

**처음 기록:** 앱 주소의 기본값은 로컬 `http://localhost:3000`입니다. 공개 HTTPS 배포와 실제 커플 계정은 이후 단계입니다.

| 들어 있는 것 | 현재 동작 |
|---|---|
| 웹과 설치 앱 | `/`의 달력, 기기 폭에 맞는 레이아웃, 설치 안내, PWA manifest·아이콘·오프라인 화면 |
| 작은 창 | `/compact`에서 날짜 수정 → 상단 ‘전체 웹앱 열기’로 같은 날짜·시간대를 전체 웹에 전달 |
| Chrome 팝업 | 첫날·시간대 선택, 기념일 계산, 기기에 기억하기 선택·해제, 새 작은 창과 전체 웹 열기. 설치용 폴더 `dist/chrome-extension` |
| P2의 DB 초안 | 두 좌석, 일회용 초대, 방 종료 알림, PostgreSQL 행 단위 권한과 회귀 테스트 |
| 다음 단계에 붙일 기능 | 이메일 인증, 방 채팅·비공개 구독, 탈퇴·삭제 UI, 공유 게임, YouTube, AI·장소 서비스 |

### 확인 기록 · 2026-11-08

- Node 24에서 패키지 설치, 타입 검사, Next.js 프로덕션 빌드가 성공했다. 단위 검사 **8개**, 임시 PostgreSQL 검사 **3개**가 통과했다.
- Linux Chromium에서 브라우저 검사 **4개**가 통과했다. (1) 패키지 팝업 소스와 실제 웹의 날짜 전달·저장 해제, (2) 독립된 두 브라우저 컨텍스트 및 320·390·768·1440px 레이아웃, (3) PWA manifest·아이콘·공개 오프라인 화면, (4) 임시 프로필에 PWA 설치 → 원래 탭과 다른 독립 창에서 전체 웹 실행 → 제거.
- (1)의 저장소·창 열기에는 테스트용 Chrome API를 사용했다. 같은 시나리오를 **실제 확장**으로 실행하는 추가 검사 1개는 이 환경의 Chromium 관리 정책이 로컬 확장 설치를 차단해 건너뛰었다. 맥의 툴바에서 직접 여는 과정, Mac Dock, 사용자의 Claude 로그인·개인 스킬 등록 상태도 실제 기기에서 확인할 항목이다.
- P2 DB 테스트는 인증 ID를 테스트용으로 전달한다. Supabase 이메일 로그인·실제 Realtime·공개 도메인은 아직 연결하지 않았다.

### 인계 기록 · 2026-11-08 · P1 배포 · 브랜치 `p1-preview-deploy` (커밋 전)

- **사용자 행동·변경한 파일:** 배포 주소에서 기념일 화면이 열리고, 그 주소로 다시 빌드한 확장이 같은 날짜·시간대를 넘긴다. 바꾼 파일은 `playwright.config.ts`(`PREVIEW_URL`이 있으면 그 HTTPS 주소를 검사 대상으로 사용), `tests/browser/pwa.spec.ts`(고정 로컬 주소를 `baseURL`로 변경), `docs/ARCHITECTURE.md`, 이 파일. 패키지 변경 없음.
- **실행한 명령:**
  - 로컬 `npm run build` 성공.
  - 로컬 브라우저 검사 4개 통과 (실제 확장 검사 포함, 건너뜀 0).
  - 배포 주소 `curl` 9개 경로 모두 200. `sw.js`는 `no-store`, `offline.html`은 `no-cache`.
  - `PREVIEW_URL=https://duri-chrome-starter.vercel.app`로 같은 브라우저 검사 4개 통과 (건너뜀 0).
  - `npm run extension:build -- https://duri-chrome-starter.vercel.app` 후 `origin.js`가 그 주소이고 `dist/chrome-extension`에 localhost 없음.
  - `npm run typecheck` 성공. `npm test` 전체 통과: 단위 8개, DB 3개 (단위·DB는 따로 다시 돌려 개수 확인, 실패·건너뜀 0), 브라우저 5개 통과. 브라우저 5개는 `npm test` 출력의 `5 passed`이고 건너뜀 표시는 없었다.
- **실제 주소·확인한 기기:** https://duri-chrome-starter.vercel.app/ (Production 고정 주소). 사용자가 시크릿 창에서 로그인 없이 열리는 것을 확인했다. Deployment Protection은 끄지 않았다.
- **미확인:** 휴대폰에서 직접 열기, 맥 Chrome 툴바에서 다시 빌드한 확장의 두 버튼 직접 누르기, 설치한 PWA가 배포 주소에서 옛 화면을 보여 주지 않는지 직접 확인.

**다음 작업 하나**는 `chrome://extensions`에서 ‘둘이’를 새로고침한 뒤 ‘첫날 선택 → 작은 창으로 열기 → 전체 웹앱 열기’가 `duri-chrome-starter.vercel.app`에서 같은 날짜·시간대로 열리는지, 휴대폰에서도 같은 주소가 열리는지 확인하는 것이다. 통과하면 P1이 끝난다.

### 인계 기록 양식

- 날짜·단계·커밋
- 완료한 사용자 행동·변경한 파일
- 실행한 명령·성공/실패/건너뜀
- 실제 프리뷰 주소·확인한 기기
- 다음 행동 하나·관련 파일·통과 조건


### 확인 기록 · 2026-11-08 (도구 모음 패널)

- ‘작은 창으로 열기’는 Mac 전체 화면에서 새 창이 전체 화면을 물려받거나, 보통 크기로 바꾸면 전체 화면 밖으로 옮겨지는 문제가 있어 제거했다. 사용자 결정.
- 대신 툴바 패널을 웹앱과 같은 카드(오늘 날짜, 함께한 일수, 다음 백 단위 기념일, 연애 기념일)로 바꾸고, 날짜 설정은 접어 둔다. 첫날이 없으면 자동으로 펼친다. 로그인·방 데이터는 계속 웹에서만 다룬다.
- `/compact` 웹 페이지는 PWA·직접 접속용으로 유지한다.
- 검사: 단위 8개 통과. Linux Chromium에서 브라우저 5개 통과(실제 확장 로드 포함, 건너뜀 0). Mac에서 패널을 직접 연 확인은 아직이다.
- 다음 행동 하나: Mac에서 ‘둘이’를 새로고침해 패널 모양과 ‘전체 웹앱 ↗’ 이동을 확인한 뒤 main에 합친다.

### P2 첫 작업 · 2026-11-08 (로그인·방·초대)

- Supabase 테스트 프로젝트 `duri-dev`(us-east-1) 연결. 방 마이그레이션 적용과 RLS 4개 표 확인. URL 설정에 Site URL과 `localhost:3000/**`, 배포 주소 `/**` 등록.
- 노출된 secret key 두 개는 폐기하고 새 키로 교체. `.env.local`은 Git 제외.
- 추가: `/login`(이메일 링크), `/auth/callback`, `/room`(방 만들기·일수·초대 링크), `/invite/[token]`(입장), 로그아웃, `src/proxy.ts`(세션 갱신만). 패키지 `@supabase/supabase-js`, `@supabase/ssr` (사용자 허락).
- 초대 토큰은 리디렉션 URL에 넣지 않고 화면에만 돌려준다. 로그인 후 복귀 경로는 같은 사이트 경로만 허용.
- 검사: 단위 11개, DB 3개(비root 사용자), 브라우저 5개 통과, typecheck·build 통과. Linux 작업 환경은 Supabase에 접속할 수 없어 실제 메일 로그인은 아직 보지 못했다.
- 남은 P2: 실제 A/B/C 세 계정 확인, 방 나가기 화면, 내 데이터·계정 삭제, 비공개 실시간 채널, Vercel 환경 변수 설정 후 배포.
- 다음 행동 하나: Mac에서 `npm run dev` → `localhost:3000/login`으로 A 계정 로그인 → 방 만들기 → 초대 링크를 B 계정(시크릿 창)으로 열어 입장 확인.

### P2 Google 로그인·두 계정 확인 · 2026-11-09

- 이메일 링크는 Supabase 기본 메일 한도(시간당 몇 통) 때문에 출시용으로 부족해 Google 로그인을 붙였다. Google Cloud 프로젝트 `duri-dev-sk0720`, 동의 화면은 테스트 모드(테스트 사용자 2명).
- `/login`에 ‘Google로 계속하기’. `prompt=select_account`로 한 기기에서 두 사람이 번갈아 로그인할 수 있게 계정 선택을 항상 보여 준다.
- 실제 확인: A(samuelkoo0720) Google 로그인 → 기존 이메일 계정·방에 그대로 연결. B(yeunjuji) Chrome 시크릿 창에서 Google 로그인 → 초대 수락 → `/room`에 “두 사람이 모두 들어왔어요” 표시.
- 알려진 문제: Claude 데스크톱 앱의 내장 브라우저에서는 Google → Supabase 콜백이 두 번 불려 `flow_state_already_used`가 난다. Chrome에서는 재현 안 됨. 앱 코드 문제 아님.
- 출시 전: 동의 화면 게시(Publish), 자체 도메인 + Resend SMTP.
- 다음 행동 하나: 방 나가기 화면.

### P2 방 나가기 · 2026-11-09

- `/room` 아래 접힌 ‘방 나가기’: 확인 체크 필수 → `leave_couple_room` RPC → 두 사람 모두 빠지고 방 닫힘. 나간 사람은 “방에서 나왔어요”, 상대는 7일 안에 “상대가 방을 나갔어요” 안내.
- 실제 확인: B(시크릿 창)가 나감 → A 로그인 시 안내 표시, 방 만들기 화면으로 돌아감.
- 다음 행동 하나: 내 데이터·계정 삭제.

### P2 계정 삭제·보안 점검 · 2026-11-09

- `delete_my_account()` RPC(마이그레이션 `202611090001`): 방에 있으면 상대에게 안내를 남기고 방·초대·자리를 지운 뒤 `auth.users`에서 본인을 지운다. 한 트랜잭션. `/room` 아래 접힌 ‘계정 삭제’(확인 체크 필수) → `/login?deleted=1`.
- DB 테스트 4개 통과(새 테스트: 방 있는 사람·없는 사람 삭제, anon 호출 거부). Supabase `duri-dev`에 적용 완료.
- Security Advisor: 오류 0. 경고 중 ‘로그인 사용자가 SECURITY DEFINER 함수 실행 가능’ 5개는 의도된 API(각 함수가 `auth.uid()`와 방 멤버 여부를 직접 확인). `rls_auto_enable()`의 외부 실행 권한은 회수(`202611090002`). ‘유출 비밀번호 보호’는 비밀번호 로그인을 쓰지 않아 해당 없음.

### P2 자동 흐름 테스트·배포 설정 · 2026-11-09

- `/auth/callback`이 `?token_hash=`도 받는다(`verifyOtp`). PKCE 보관값이 필요 없어 다른 브라우저에서 메일 링크를 열어도 된다.
- `npm run test:flow`(`tests/flow/two-users.spec.ts`): 관리자 키로 가짜 사용자 A·B·C를 만들고 메일 없이 로그인 → 방 만들기 → 초대 → B 입장 → C는 같은 링크 거부 → B 나가기·A 안내 → A 계정 삭제 확인 → 정리. `npm run dev`와 `.env.local`의 `SUPABASE_SECRET_KEY` 필요.
- Vercel 환경 변수(Production·Preview, Config): `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. secret key는 Vercel에 넣지 않는다(앱 코드가 쓰지 않음).
- `npm run test:flow` 통과(Mac, 2026-11-09). 첫 실패는 앱이 아니라 테스트 선택자 문제: Next.js가 모든 페이지에 빈 `role="alert"` 안내 상자를 두어 `getByRole("alert")`가 2개를 찾음 → 글자로 찾도록 수정.
- `npx vercel --prod` 배포 완료 → https://duri-chrome-starter.vercel.app . 확인: `/room` → 로그인으로 이동, Google 버튼이 배포 주소 `/auth/callback`으로 돌아오도록 설정됨.
- 남은 P2: 비공개 실시간 채널(상대 입장·퇴장이 새로고침 없이 보이게). 출시 전: Google 동의 화면 게시, 자체 도메인 + Resend SMTP, Supabase Site URL을 배포 주소로 유지.
- 다음 행동 하나: 비공개 실시간 채널.

### P2 실시간 반영 · 2026-11-11

- 홈 오른쪽 위에 ‘로그인 · 우리 방’ 링크 추가(배포 완료). 전에는 홈에서 로그인으로 가는 길이 없었다.
- 비공개 Realtime Broadcast(마이그레이션 `202611110001`): `couple_members`에 들어오거나 나가면 트리거가 `room:<방 id>` 주제로 신호를 보낸다. `realtime.messages` 정책 `room_members_listen`이 그 방 멤버만 듣게 한다. 신호에는 개인 정보 없이 `insert`/`delete`만 담긴다. Supabase `duri-dev`에 적용·확인(트리거·정책·함수 각 1).
- `/room`의 `RoomLive`가 신호를 받으면 `router.refresh()`로 화면을 다시 그린다. 연결되면 `<html data-room-live="on">`.
- 검사: DB 5개 통과(새: 들어옴·나감 신호, 멤버만 청취, 잘못된 주제 거부, 나간 뒤 청취 불가). 단위 11개 통과. typecheck 통과. 흐름 테스트는 새로고침 없이 A 화면이 바뀌는지 확인하도록 강화.
- 다음 행동 하나: 배포 후 `FLOW_URL=https://duri-chrome-starter.vercel.app npm run test:flow`.
- 배포 후 `FLOW_URL=https://duri-chrome-starter.vercel.app npm run test:flow` 통과(1 passed, 18.9s): 실제 사이트에서 새로고침 없이 A 화면이 바뀜.
- `/privacy`, `/terms` 배포. Google 동의 화면 브랜딩(홈페이지·개인정보·약관 주소, 승인 도메인 `duri-chrome-starter.vercel.app`) 저장 후 **프로덕션 단계로 게시** → 모든 Google 계정 로그인 가능.
- **P2 완료.** 다음: P3 첫 커플 베타. 남은 출시 전 항목: 자체 도메인 + Resend SMTP(이메일 로그인 한도), 화면 디자인 개편.

### 디자인 개편·GitHub · 2026-11-11

- 홈 전면 개편(Hallmark full, 브랜드 berry·cream 유지): 첫 화면에 실시간 일수 카드(날짜 입력이 카드 안), 다가오는 기념일 6개 레일(`upcomingMilestones`, 단위 테스트 4개), 3단계 설명, 앱 설치 띠, 큰 워드마크 바닥글. 제목·숫자 글꼴 Jua(`next/font/google`), 한국어 줄바꿈 `keep-all`. 로그인·방·초대·정책·작은 창도 같은 토큰과 버튼. 파일: `src/app/{page,preview,layout}.tsx`, `src/app/{globals,tokens,base}.css`, `src/core/dates.ts`.
- 검사: sloplint 렌더 0 FAIL(이전 10 FAIL), 단위 15개 통과, typecheck 통과. 1440·1280·1920·375 스크린샷 확인. 미확인: Jua가 적용된 실제 화면(작업 환경에서 Google Fonts 차단), 브라우저 e2e 전체.
- GitHub 비공개 저장소 생성·연결: https://github.com/Samuel0720-source/duri-chrome-starter (`main` 푸시). 비밀키는 이력에 없음을 확인.
- 다음 행동 하나: `npx vercel --prod`로 새 디자인 배포 후 실제 화면 확인.

### P3-1 방 홈 · P3-2 대화 · 2026-11-11

- **방 홈**(`202611110002_room_home.sql`, `src/app/room/page.tsx`, `mood-picker.tsx`): 다섯 무드(미리보기 후 적용, 상대 화면 즉시 반영), 공유 약속(추가·삭제, ‘다음 만남 D−n’, 지난 약속 접기), 첫날·시간대 수정. 모든 쓰기는 멤버 확인 RPC. 실제 사이트 흐름 테스트 통과(A 약속 → B 즉시, B 무드 → A 즉시).
- **다가오는 기념일**(홈): 다음 n00일과 다음 주년만, 그리고 100일 안의 발렌타인데이·화이트데이·여자친구의 날(8/1)·남자친구의 날(10/3)·크리스마스. `upcomingMilestones` 단위 테스트 6개.
- **대화**(`202611110003_room_chat.sql`, `/room/chat`): 요청 ID로 재전송 중복 없음, 10초에 10개 제한, 1~1000자, 본인 메시지만 삭제, 실패 시 ‘다시 보내기’, 재연결 시 놓친 메시지 따라잡기. 방 메뉴 탭 ‘홈 / 대화’.
- 검사: DB 7개 통과(새: 방 홈, 대화), 단위 19개 통과, typecheck 통과. Supabase 적용 확인(방 홈 표1·함수5·트리거2, 대화 표1·함수2·트리거1). 흐름 테스트에 대화 단계 추가(배포 후 실행 필요).
- 알려진 문제: 작업 환경에서 DB 테스트 파일을 새로 복사한 직후 첫 실행이 테스트 DB 종료 단계에서 파일 단위 실패로 끝나는 일이 두 번 있었다. 개별 테스트는 모두 통과했고 다시 실행하면 exit 0.
- 미확인: 로그인한 방 화면을 직접 눈으로 본 확인(작업 환경에서 로그인 불가). 종료 방 공동 데이터 30일 정리 작업은 아직 없음.
- 다음 행동 하나: 배포 후 `FLOW_URL=https://duri-chrome-starter.vercel.app npm run test:flow`, 그다음 P3-3 ‘상대 선택 맞히기’.

### P3-3 상대 선택 맞히기 · 2026-11-11

- `202611110004_guess_game.sql`, `/room/game`, `src/core/guess.ts`(질문 12개 × 보기 4개). 방 메뉴 ‘홈 / 게임 / 대화’.
- 답은 `duri_private.guess_answers`(권한 없음 + RLS 켬). 화면은 `guess_state()`만 읽는다: 상대 답은 그 라운드를 둘 다 답한 뒤에만 들어온다. 실시간 신호에는 `{change:'answer'}`만. 같은 답 재전송은 그대로, 답 바꾸기는 거부. 방마다 진행 중 게임 하나.
- 검사: DB 8개 통과(새: 답 숨김·재전송·변경 거부·제3자 거부·신호에 답 없음·점수·새 게임). 10번 연속 실행 실패 0(PostgreSQL 종료 알림 57P01 처리로 간헐 실패 해결). 단위 20개, typecheck 통과. Supabase 적용 확인(RLS 표 2·함수 3·트리거 1). 흐름 테스트에 게임 단계 추가(A 답 → B 화면에 결과 없음 → B 답 → 둘 다 공개 → 3라운드 결과 → 새로고침 복원).
- 다음 행동 하나: 배포 후 흐름 테스트. 통과하면 P3 완료 → 첫 커플 베타(초대부터 다음 날 재방문까지 실제 확인).

### 자동 배포·자동 검사 · 2026-11-11

- Vercel 프로젝트를 GitHub `Samuel0720-source/duri-chrome-starter`에 연결: `main`에 push하면 Production 자동 배포(87c39f9부터 확인).
- Vercel Git 설정의 ‘deployment_status Events’를 켜야 GitHub가 배포 완료를 알 수 있다(켜 둠).
- GitHub Actions: `check.yml`(push마다 단위·DB·빌드·브라우저 전체), `live-flow.yml`(Production 배포 성공 뒤 실제 사이트에서 `tests/flow` 두 사람 흐름). 저장소 secret `SUPABASE_SECRET_KEY` 사용자 등록.
- 로그인한 방 홈에도 ‘다가오는 기념일’ 표시(`src/app/milestone-rail.tsx`를 공개 홈과 공유).
- 배포 완료 신호(deployment_status)가 GitHub에 오지 않아 방식을 바꿈: `live-flow.yml`이 push마다 실행 → `/api/version`이 새 커밋을 보일 때까지 기다림 → `tests/flow` 실행.
- **GitHub Actions에서 실제 사이트 흐름 테스트 통과(b598e8c, 1 passed, 21.6s):** 방 만들기·기념일 표시·초대·입장·약속·무드·대화·게임(답 숨김→동시 공개→결과)·제3자 거부·나가기·계정 삭제.
- **P3 자동 검사 완료.** 남은 P3 통과 기준: 실제 커플 한 쌍이 초대부터 다음 날 재방문까지 써 보기(사람 확인).
- 다음 행동 하나: P4-1 ‘100초 그림 퀴즈’.

### P4-1 100초 그림 퀴즈 · 2026-11-12

- **변경 경로:** `supabase/migrations/202611120001_draw_quiz.sql`, `src/core/draw.ts`, `src/app/room/game/draw-game.tsx`, `src/app/room/game/page.tsx`(‘상대 선택 맞히기 / 100초 그림 퀴즈’ 전환, `?g=draw`), `src/core/auth-paths.ts`(새 오류 문구), `src/app/globals.css`, `tests/database/rooms.test.mjs`, `tests/unit/draw.test.mjs`, `tests/flow/two-users.spec.ts`.
- **동작:** 카테고리(음식·동물·사물·장소·데이트 활동) 선택 → 둘 다 ‘준비’ → DB가 100초 마감을 정함 → 한 명이 펜(색 7·굵기 3)·되돌리기·전체 지우기로 그리고, 다른 한 명이 답을 입력. 오답은 계속 재시도, 정답은 즉시 종료, 시간이 끝나면 정답 공개. 카테고리별 커플 최고 기록. ‘한 판 더’는 역할 교대. 준비 전에는 ‘카테고리 다시 고르기’(취소) 가능.
- **보안·정확성(P4 통과 기준):** 제시어는 `duri_private.draw_words`(권한 없음 + RLS)에만 있고 `draw_state()`가 그리는 사람에게만, 맞히는 사람에게는 끝난 뒤에만 준다. 단어장 `duri_private.draw_word_bank`(카테고리당 20개, 허용 표기 포함)도 같은 방식이라 브라우저 번들에 정답 후보가 없다. 마감은 `clock_timestamp()`로 DB가 정하고, 화면 시계는 DB 시각과의 차이를 보정해 센다. 정답·시간 만료는 행 잠금 + `where result is null`로 한 번만 확정. 마감 뒤 답·선은 거부. 실시간 신호는 `{change}`만.
- **검사 결과(실제):**
  - DB 9개 통과(새 1개: 단어 비공개·100초 마감·선 재전송 중복 없음·되돌리기·정답 동시 제출에서 한 명만 성공·마감 뒤 정답 거부·기록은 더 빠를 때만 갱신·제3자 거부·방 나간 뒤 거부). 3번 연속 실행 실패 0.
  - 단위 24개 통과(새 4개), `tsc --noEmit` 통과.
  - GitHub Actions `Check starter` 통과(전체: 단위·DB·빌드·브라우저).
  - **GitHub Actions 실제 사이트 흐름 테스트 통과(867385e, 1 passed, 22.0s):** A가 그리면 B 화면에 선이 나타남, B 새로고침 후 그림·남은 시간 유지, 맞히는 사람 B가 받은 모든 서버 응답에 제시어 없음, 오답 재시도(A 화면에도 시도 목록), 정답 시 양쪽 ‘정답!’, 기록 표시, 한 판 더에서 역할 교대.
  - Supabase 적용 확인(duri-dev): 표 6개(RLS 꺼진 표 0), 단어장 카테고리당 20개, 함수 8개 로그인 사용자만 실행(anon 불가), 로그인 사용자가 비공개 표 읽기 불가, 트리거 3개. 적용한 SQL의 SHA-256이 파일과 일치.
- **고친 것:** 첫 흐름 테스트 실패(`add_draw_stroke` 요청이 나가지 않음)는 앱 버그가 아니라, 그림판이 테스트 브라우저 화면 밖에 있어 마우스 이벤트가 전달되지 않은 것이었다. 테스트에서 그림판을 스크롤해 들인 뒤 그리도록 수정하고, “A 쪽 서버가 선을 받았는지”를 “B 화면에 나타났는지”보다 먼저 확인하도록 나눴다.
- **미확인:** 휴대폰 터치로 그릴 때의 감각(가로 모드·손가락 굵기), 두 명이 서로 다른 네트워크에서 쓸 때의 선 지연 체감, 로그인한 그림 퀴즈 화면의 디자인을 눈으로 본 확인(작업 환경에서 로그인 불가), 그림판의 스크린 리더 대체 설명은 ‘그림판’ 라벨뿐. 이 단계에서 그림을 파일로 저장하는 기능은 없음.
- **알려진 한계:** 선은 펜을 누르는 동안 150ms마다 잘라 보내므로 상대 화면에서는 약간 끊겨 보일 수 있다. 한 판에 선 조각 800개, 답 시도 80번까지.
- 다음 행동 하나: Sam이 두 기기(또는 크롬 + 시크릿 창)로 로그인해 게임 탭 → ‘100초 그림 퀴즈’를 직접 한 판 해 보고, 손으로 그릴 때 불편한 점을 알려 주기. 그다음 P4-2 ‘YouTube 함께 보기’.

### P4-2 YouTube 함께 보기 · 2026-11-12

- **변경 경로:** `supabase/migrations/202611120002_watch_together.sql`, `src/core/watch.ts`(링크 해석·목표 위치·메아리 분류·드리프트 점검 조건·오류 문구), `src/app/room/watch/page.tsx`, `src/app/room/watch/watch-together.tsx`, `src/app/room/room-tabs.tsx`(‘함께 보기’ 탭 추가: 홈/게임/함께 보기/대화), `src/core/auth-paths.ts`, `src/app/globals.css`, `tests/database/rooms.test.mjs`, `tests/unit/watch.test.mjs`, `tests/flow/two-users.spec.ts`.
- **동작:** 한 명이 유튜브 링크를 넣으면 DB가 영상 번호를 뽑아 저장(잘못된 링크는 한국어 오류) → 둘 다 ‘준비됐어요’를 눌러야 같은 DB 시각에 시작 → ‘같이 재생·멈춤·±10초’ 버튼이나 영상 자체 컨트롤(재생/멈춤/진행바)을 쓰면 상대도 따라감. 새로고침·재접속하면 서버 위치로 바로 이동. 둘 다 나가면 마지막 위치를 저장하고 멈춤(둘 다 45초 이상 신호가 없어도 마지막으로 본 때에 맞춰 멈춤). 영상 퍼가기 차단·삭제·자동 재생 차단은 화면에 다음 행동(다른 링크, ‘눌러서 같이 보기’)과 함께 표시.
- **규칙(POLICIES 그대로):** 시간표 = 영상 번호·기준 위치·DB 기준 시각·재생 여부·증가하는 revision. 재생 중 목표 위치 = 기준 위치 + (DB 지금 − 기준 시각). 명령(재생·멈춤·이동·새 영상)마다 revision +1; 이미 처리한 revision이거나 내가 보낸 명령이면 플레이어를 다시 움직이지 않음. 2초마다 점검은 둘 다 와 있고 준비됐고 재생 중이며 버퍼링이 아닐 때만, 차이 > 1.0초(정확히 1.0은 유지)이고 마지막 보정 후 3초 이상일 때만 보정. 사람이 누른 조작과 재접속은 쿨다운 없이 바로 적용.
- **검사 결과(실제):**
  - DB 10개 통과(새 1개: 링크 해석 허용·거부 19건, 제3자 거부, 표 직접 읽기 거부, 둘 다 준비해야 시작, 준비 다시 눌러도 재시작 없음, 같은 요청 ID 재전송은 revision 한 번, 150ms 안 연타 거부, 잘못된 명령·위치 거부, 한 명 나가도 재생 계속·마지막이 나가면 그 위치에서 정지, 45초 무응답 정지, 새 영상은 0:00·미준비로 초기화, 신호에 영상 번호 없음). 로컬 PostgreSQL 일반 사용자로 실행.
  - 단위 31개 통과(새 7개), `tsc --noEmit` 통과.
  - GitHub Actions `Check starter` 통과(전체).
  - **GitHub Actions 실제 사이트 흐름 테스트 통과(3번째 시도, 1 passed):** 잘못된 링크 오류 → 정상 링크로 두 화면 동시 ‘멈춤’ 상태 → 한 명 준비로는 시작 안 됨 → 둘 다 준비하면 둘 다 재생(위치 차 2.5초 이내) → 같이 멈춤 → +10초 → 같이 재생 → 영상 컨트롤로 멈춤·진행바 이동이 상대에게 전달 → 새로고침 후 저장 위치(멈춤)·실시간 위치(재생)로 복귀 → 퍼가기 차단 오류 문구·‘유튜브에서 열기’·준비 버튼 비활성 → 새 링크로 복구. 앞의 두 번 실패는 앱 버그가 아니라 테스트 쪽 문제였다(상대 변경 직후 1.2초 동안은 내 플레이어 이벤트를 무시하는데 테스트가 그 안에 조작함 / 이미 준비한 상태라 버튼 이름이 달랐음).
  - Supabase 적용 확인(duri-dev): 표 2개 모두 RLS 켬, 함수 6개, 트리거 3개, 로그인 사용자도 표 직접 읽기 불가, anon은 함수 실행 불가.
- **미확인(실제 YouTube로는 못 해 봄):** 흐름 테스트는 YouTube 대신 가짜 플레이어(같은 상태 번호 1·2·3·5)를 쓴다. 실제 IFrame 플레이어의 이벤트 순서(시킨 직후 잠깐 ‘멈춤’이 끼는 현상, 광고, 버퍼링)와 모바일 자동 재생 차단 동작, 서로 다른 네트워크에서의 체감 어긋남은 사람 확인이 필요하다. 탭이 닫힐 때 ‘나갔어요’ 요청이 취소될 수 있어 그 경우 45초 뒤에 정지로 처리된다. 광고 중 상태는 플레이어가 알려 주지 않아 따로 처리하지 않았다. 로그인한 화면의 디자인은 눈으로 보지 못함.
- 다음 행동 하나: Sam이 두 기기(또는 크롬 + 시크릿 창)로 로그인해 ‘함께 보기’에서 실제 유튜브 링크 하나로 준비 → 같이 재생 → 한쪽에서 진행바 움직이기를 해 보고 어긋나거나 이상한 점을 알려 주기. 문제가 없으면 P4 종료 → P5(AI·장소).

### P5-1 비용 차단 원장 + 규칙 기반 도우미 · 2026-11-13

- **변경 경로:** `supabase/migrations/202611130001_api_budget.sql`, `src/core/recommend.ts`, `src/app/room/helper/page.tsx`, `src/app/room/helper/helper.tsx`, `src/app/room/room-tabs.tsx`(‘도우미’ 탭), `src/app/globals.css`, `tests/database/rooms.test.mjs`(service_role 역할 추가 + 새 테스트), `tests/unit/recommend.test.mjs`, `tests/flow/two-users.spec.ts`, `playwright.flow.config.ts`(전체 180초, 동작별 20초 제한).
- **비용 차단(POLICIES ‘비용과 외부 서비스’ 구현):** 유료 호출은 먼저 `reserve_api_call`로 최악 비용을 예약해야 한다. 기본값은 전부 닫힘(`paid_enabled=false`, 월 예산 0, 가격 없음). 설정 행을 `for update`로 잠가 프로젝트 월 합계와 방·UTC일 횟수를 한 번에 하나씩 확인하고, 같은 `request_key`는 재전송으로 취급해 두 번 과금하지 않는다. `settle_api_call`이 실제 비용으로 바꾸고, 응답이 안 온 호출은 최악 비용으로 남는다(보수적). `release_api_call`은 요청이 공급자에 가지 않았을 때만 돌려준다. 예약·정산·해제는 서버(service_role)만 가능하고 회원은 `api_usage`로 자기 방의 오늘 횟수와 월 사용 비율만 본다(금액 없음).
- **도우미 탭(`/room/helper`):** “10분, 경쟁은 싫어”, “말 안 해도 되는 걸로” 같은 문장에서 조건(시간·경쟁 싫음·조용히)을 읽어 쌓고, 지금 배포된 활동(상대 선택 맞히기·100초 그림 퀴즈·함께 보기) 중 맞는 것만 이유와 함께 보여 준다. 맞는 게 없으면 없다고 말한다. AI 상태 줄: 꺼짐이면 “AI 연결은 꺼져 있어요”, 켜져 있으면 오늘 사용 횟수·한도 근접 표시. **이 단계에는 유료 호출이 없다.**
- **검사 결과(실제):**
  - DB 11개 통과(새 1개: 기본 닫힘·가격 없음·예산 0 차단, 회원·anon·제3자 직접 호출 거부, 재전송 무과금, 정산 두 번 불가, 방·일 한도(해제하면 자리 복구, 방마다 따로, 장소는 별도 횟수), 월 한도에서 3개 요청이 마지막 4센트를 두고 경쟁해 정확히 1개만 성공·합계 ≤ 예산, 정산 안 된 예약은 최악 비용 유지, 종료된 방·결제 꺼짐 차단).
  - 단위 33개 통과(새 2개), `tsc --noEmit` 통과, GitHub Actions `Check starter` 통과.
  - **GitHub Actions 실제 사이트 흐름 테스트 통과(1 passed, 36.6s→재실행 통과):** 도우미 탭에서 “10분, 경쟁은 싫어” → ‘상대 선택 맞히기’만 표시(그림 퀴즈·함께 보기 없음) → ‘이 활동 열기’로 게임 화면 이동, AI 꺼짐 문구 표시.
  - Supabase 적용 확인(duri-dev): 비공개 표 2개 RLS 켬, 회원은 예약 함수 실행 불가, anon은 사용량 함수 불가, 서버 역할은 예약 가능, 현재 설정 `false/0`(닫힘).
- **고친 것:** 흐름 테스트가 도우미 입력창에 시작 전에 글을 써서(화면이 아직 준비 중) 버튼이 안 켜지는 경우가 있었다. 시작을 3초 기다린 뒤 입력하도록 했다. 앱 문제가 아니라 테스트 순서 문제. 처음 두 번 실패는 전체 제한시간(90초) 초과였고 제한을 늘렸다.
- **아직 없는 것(P5-2 이후):** 실제 AI 호출(키·가격·월 예산 필요), 두 사람 합의 대화 요약과 동의·철회, 기념일 계획 2개와 ‘기념일에 저장’, 추천 클릭 → 게임 시작/약속 저장 비율 집계, 5km 장소 검색(Places 키·예산 필요). “같은 추천을 양쪽이 눌러도 같은 게임 1개”는 게임 시작 함수가 이미 방마다 진행 중 한 판만 허용하는 것에 기대고 있고, 도우미 쪽 검사는 아직 없음.
- **Sam이 정해 줘야 할 것(내가 대신 못 하는 것):** ① AI 공급자 API 키 발급과 결제 한도 설정(키는 Vercel 환경변수 `AI_PROVIDER_API_KEY`에만, 채팅에 붙이지 말 것), ② 월 예산(제안 CAD 15)과 호출당 가격, ③ 장소 검색을 쓸지(Google Places 키). 정하기 전까지 모든 유료 호출은 DB가 막는다.
- 다음 행동 하나: Sam이 위 ①~③ 중 AI 쪽(키·예산)을 정해 주면 P5-2에서 활동 추천을 실제 AI로 연결(예약 → 호출 → 정산 경로)한다. 그 전에 도우미 탭을 두 기기로 한 번 써 보고 어색한 문장이 있으면 알려 주기.

### P6-1 오목 · 2026-11-13

- **변경 경로:** `supabase/migrations/202611130002_gomoku.sql`, `src/core/gomoku.ts`, `src/app/room/game/gomoku-game.tsx`, `src/app/room/game/page.tsx`(게임 전환에 ‘오목’, `?g=gomoku`), `src/core/auth-paths.ts`, `src/app/globals.css`, `tests/database/rooms.test.mjs`, `tests/unit/gomoku.test.mjs`, `tests/flow/two-users.spec.ts`.
- **동작:** 15×15, 자유 규칙(가로·세로·대각선 5개 **이상**이면 승리, 보드가 차면 무승부). 한 칸을 누르면 미리보기(반투명 돌)가 뜨고 ‘여기에 놓기’를 눌러야 둔다(모바일 오터치 방지). 마지막 수 표시, 승리선 강조, 누적 전적(나/상대 승, 무승부), 항복(확인 한 번), 재대결 때 선공 교대, 새로고침하면 보드·전적 복원. 도우미 추천 목록에는 아직 오목이 없다(도우미는 마지막에 정리).
- **검사 결과(실제):** DB 12개 통과(새 1개: 차례 아님·이미 돌 있음·범위 밖 거부, 같은 탭 재전송은 ‘duplicate’로 돌 한 개, 같은 사람이 동시에 두 곳을 눌러도 한 개만 성공, 네 방향 승리 각각·4개는 미승리·6개 연속도 승리하고 6개 전체 강조, 보드가 가득 차면 무승부(빈 칸 1개를 남기고 함수로 마지막 수), 끝난 판에 수 거부, 항복 승리 1번만 집계, 선공이 매 판 교대, 제3자 거부, 신호에 좌표 없음). 단위 35개, `tsc --noEmit`, `Check starter` 통과. **GitHub Actions 실제 사이트 흐름 테스트 통과(1 passed, 47.3s):** A가 시작 → B 화면 자동 갱신 → 번갈아 두기 → A 가로 5개 → 양쪽 ‘이겼어요/졌어요’, 승리선 5칸, 전적 ‘나 1승·상대 0승’, B 새로고침 후 복원, B의 재대결에서 B가 선공.
- Supabase 적용 확인(duri-dev): 표 3개 모두 RLS 켬, 함수 4개, 트리거 2개, 로그인 사용자도 표 직접 읽기 불가, anon 실행 불가, 로그인 사용자는 함수 실행 가능.
- **미확인:** 휴대폰에서 15×15 칸을 손가락으로 누르는 감각(칸이 작음), 화면 디자인을 눈으로 본 확인, 스크린 리더로 돌 위치 읽기(칸마다 ‘행·열·돌’ 라벨은 있음). 흑 금수(3-3 등)는 자유 규칙이라 없음.
- 다음 행동 하나: P6-2 ‘동시 미니골프’(서버 계산 샷, 공 두 개 동시 진행). 그 전에 Sam이 두 기기로 오목을 한 판 해 보고 칸이 너무 작으면 알려 주기.

### P6-2 동시 미니골프 · 2026-11-13

- **변경 경로:** `supabase/migrations/202611130003_minigolf.sql`, `src/core/golf.ts`, `src/app/room/game/golf-game.tsx`, `src/app/room/game/page.tsx`(‘미니골프’, `?g=golf`), `src/core/auth-paths.ts`, `src/app/globals.css`, `tests/database/rooms.test.mjs`, `tests/unit/golf.test.mjs`, `tests/flow/two-users.spec.ts`.
- **동작:** 공 두 개가 한 코스에서 **동시에** 굴러간다(서로 통과, 벽·블록에서만 튕김). 끌어당겼다 놓으면 반대로 날아간다(슬링샷), 접근성용 ‘버튼으로 치기’(방향·세기 슬라이더)도 있다. 1홀 또는 3홀 코스, 홀당 최대 10타, 둘 다 컵인하고 재생이 끝나면 다음 홀. 끝나면 두 사람 합계 타수 중 **1홀/3홀 각각 최저 기록**만 갱신된다(‘나쁜 판’은 기록을 못 지움). 이 판 그만두기(기록 없음).
- **설계 변경 기록:** ARCHITECTURE의 “짧은 HTTP 요청 1회”는 Next 서버 경로 대신 **DB 함수 1회 호출**(RPC도 HTTP 요청 1회)로 구현했다. 이유: 비밀키 필요 없음, 샷 저장·타수 증가가 한 트랜잭션, 내장 PostgreSQL로 테스트 가능.
- **검사 결과(실제):** DB 13개 통과(새 1개: 같은 입력 → 같은 경로, 75번 굴려 필드 밖으로 나가지 않음, 느린 공은 컵인·빠른 공은 컵 위를 지나감, 같은 샷 id 재전송 → 타수 1, 굴러가는 동안 재타격 거부, 두 사람이 동시에 쳐도 각자 단독 시뮬레이션과 경로 동일, 재생 중엔 다음 홀 안 넘어감, 3홀 합계 이월, 최저 기록만 개선·1홀/3홀 분리, 10타 제한, 취소, 제3자·표 직접 읽기 거부, 신호에 좌표 없음). 단위 40개, `tsc --noEmit` 통과. 테스트로 **진짜 버그 2개**를 잡아 고쳤다(변수명이 열 이름과 겹침, 마지막 호출에서 기록이 비어 보임).
- **GitHub Actions 실제 사이트 흐름 테스트 통과(3m5s):** A는 마우스 드래그, B는 ‘버튼으로 치기’로 동시에 쳐서 양쪽 화면에 서로의 타수가 뜨고 공이 멈춤, B 새로고침 후 타수 복원, ‘이 판 그만두기’ → 양쪽 ‘취소됨’. (첫 실행은 캔버스가 창 밖이라 마우스가 닿지 않아 실패 → 테스트에서 스크롤로 해결, 앱 버그 아님.) `Check starter` 통과.
- Supabase 적용 확인(duri-dev): 표 4개 RLS 켬, 공개 함수 4개(로그인 사용자만 실행, anon 불가), 내부 함수 4개 잠김, 표 직접 읽기 불가, 트리거 2개.
- **미확인:** 실제 휴대폰 드래그 감각·코스 난이도(3개 코스 수치는 임의), 눈으로 본 화면 디자인, 두 기기에서 재생이 같은 순간에 보이는지(시계 오차는 DB 시계 기준으로 보정함), 홀인원이 나오는 실제 플레이(자동 테스트는 DB에서 위치를 옮겨 검증).
- 다음 행동 하나: Sam이 두 기기로 1홀을 쳐 보고 너무 어렵거나 쉬우면 알려 주기. 그 뒤 P6 마지막 항목(.com/.ca 연결, 확장 배포 빌드 — 도메인 선택 필요).

### P6-3 Sam 피드백 반영 · 2026-11-13

- **요청:** 골프 끊김·버튼 치기 삭제·더 어렵고 큰 진짜 골프·3/6/9홀·누적 타수 라이브, 오목 승리 5돌 색 강조, 로그인 유지, 질문 다양화, 그림 퀴즈를 "100초에 많이 맞히기"로, 그릴 사람 직접 선택.
- **변경 경로:** `supabase/migrations/202611130004_golf_v2.sql`, `202611130005_guess_bank.sql`, `202611130006_draw_rush.sql`, `src/core/golf.ts`, `src/app/room/game/golf-game.tsx`, `src/core/guess.ts`(질문 120개), `src/core/draw.ts`, `src/app/room/game/draw-game.tsx`, `src/app/page.tsx`·`src/app/login/page.tsx`·`src/proxy.ts`(로그인 유지), `src/app/globals.css`·`src/app/tokens.css`, `tests/database/rooms.test.mjs`, `tests/unit/{golf,guess,draw}.test.mjs`, `tests/flow/two-users.spec.ts`.
- **로그인 유지:** 원인은 세션이 아니라 화면 흐름이었다. 로그인 쿠키는 원래 400일 유지되지만, 확장의 "전체 웹앱 열기"가 여는 홈(`/`)이 로그인 여부를 보지 않고 항상 "로그인" 버튼만 보여 줬다. 이제 로그인된 기기는 홈·로그인 페이지에서 바로 `/room`으로 가고, 홈에서도 세션을 갱신한다. 흐름 테스트가 쿠키 만료가 300일 이상인지 확인한다.
- **골프 끊김 원인과 수정:** (1) 상태를 읽을 때마다 시계 보정값을 새로 잡아 공이 앞뒤로 튐 → 왕복 시간이 가장 짧은 측정만 사용(`updateClock`); (2) 친 사람은 응답 후 한 번 더 읽어야 공이 움직임 → `golf_shot`이 바로 재생 시각을 돌려줌; (3) 상대 공은 신호가 늦으면 중간부터 보임 → 1.5초까지 늦은 재생은 처음부터 재생(`replayDelay`); (4) 경로를 3틱마다 저장해 튕길 때 모서리가 잘림 → 매 틱 저장. 코스 그림은 홀마다 한 번만 그려 두고 매 프레임 공·깃발만 그림.
- **골프 규칙:** 9개 홀(이름 있음), 모래(마찰 0.93), 물(친 자리로 돌아오고 +1타), 3/6/9홀 선택, 큰 누적 타수판(나/상대, 홀이 바뀌어도 이어서 더해짐), 기록은 3/6/9홀 따로. 버튼으로 치기 삭제(접근성 대체 수단이 없어진 점은 한계). 9홀 모두 자동 탐색으로 깰 수 있음 확인(2번 홀은 중간 목표를 주면 2타).
- **질문:** 12개 → 120개. 방에서 가장 오래 안 나온 질문부터 → 40판 동안 반복 없음(DB 테스트).
- **그림 퀴즈:** 100초 동안 여러 단어, 맞히면 +1점·다음 단어·깨끗한 그림판, 그리는 사람 "패스", 기록 = 맞힌 개수(카테고리별), 시작할 때 "내가 그릴게요/상대가 그려요", 단어 300개(카테고리당 60) + "전부 섞기", 방에서 오래 안 나온 단어부터. 맞히는 사람은 현재 단어를 끝까지 받지 않음(DB·흐름 테스트).
- **검사 결과(실제):** DB 14개 통과(골프 2판, 질문 은행 40판, 그림 퀴즈 2판 포함), 단위 42개, `tsc` 통과. 로컬 `next build`는 이 작업 환경이 Google Fonts에 접속하지 못해 실패 → CI에서 확인. Supabase 적용 후 함수 18개 원문 해시가 로컬 테스트 DB와 모두 일치, 단어 60×5, 새 함수 권한(anon 불가, 내부 함수 잠김) 확인. 예전 골프 판·기록과 "초" 단위 그림 기록은 새 규칙과 비교할 수 없어 지움.
- **GitHub Actions 실제 사이트 흐름 테스트 통과(4m56s):** 로그인 쿠키 만료 300일+·홈/로그인 페이지가 방으로 바로 이동, 그림 퀴즈(정답 → 양쪽 1점·새 단어·B 그림판 비워짐, 패스, B가 받은 응답 어디에도 현재 단어 없음, **실제 100초** 후 양쪽 '1개'·기록 1개, '상대가 그려요'로 역할 선택), 골프(두 사람 동시 드래그 → 양쪽 타수판 1/1, A 재타격이 B 화면에 라이브로 2, 새로고침 복원, 그만두기). 첫 실행은 테스트가 관리자 키로 마감 시각을 옮기려다 실패(이 프로젝트의 service_role에는 표 권한이 없음) → 권한을 넓히지 않고 실제 100초를 기다리게 바꿈. `Check starter`(빌드·브라우저 검사 포함) 통과.
- **미확인:** 두 실제 기기에서의 골프 부드러움·난이도, 휴대폰에서 작은 코스(공이 작게 보임), 그림 퀴즈를 100초 끝까지 사람이 하는 흐름(자동 테스트는 마감 시각을 옮겨 확인).
- 다음 행동 하나: Sam이 두 기기로 골프 3홀과 그림 퀴즈 한 판을 해 보고 느낌을 알려 주기.

### P7 설정·언어·애칭·읽음·영상·골프·확장 출시 · 2026-11-13 · 커밋 77bf25c

- **요청(Sam):** 외국인도 쓰게 언어 설정, 설정 안에 방 설정(테마)·사용 가이드·계정 삭제, 서로 애칭(게임·채팅에 표시), 채팅 읽음 표시, YouTube 외 영상 링크로 같이 보기, 영상 밑 ←/→ 10초, 골프 놓을 때 버벅임, 다음 단계(도메인·확장 출시 빌드).
- **변경 경로:** `supabase/migrations/202611140001_member_prefs.sql`(애칭·읽은 위치), `202611140002_draw_english.sql`(단어 300개 영어·영어 정답 인정), `202611140003_watch_sources.sql`(youtube/vimeo/file), `src/i18n/`(core·dict·server·client·messages/ko·en, 키 약 441개), `src/app/room/settings/page.tsx`, `src/app/room/room-shell.tsx`, `src/app/room/delete-account.tsx`, `src/app/language-form.tsx`, `src/app/lang-switch.tsx`, `src/lib/room-names.ts`, `src/core/{chat,golf-physics,guess-en}.ts`, `src/app/room/watch/players.ts`·`watch-together.tsx`, `src/app/room/game/golf-game.tsx`, 모든 방·게임·법률 화면(번역), `extension/_locales/{en,ko}`, `extension/manifest.json`(0.2.0), `extension/popup.{html,js}`, `scripts/release-extension.mjs`, `docs/RELEASE.md`, 테스트(`tests/unit/{i18n,chat,release}.test.mjs` 새로, 나머지 갱신, `tests/database/rooms.test.mjs`, `tests/flow/two-users.spec.ts`), Playwright 로캘 ko-KR.
- **골프 버벅임 원인:** 놓는 순간 서버 응답(왕복)이 올 때까지 공이 멈춰 있었다. 이제 브라우저가 DB와 **같은 물리 코드**(`golf-physics.ts`, PL/pgSQL 한 줄씩 옮김)로 즉시 굴리고, 서버 경로는 확인용이다. 270개 샷이 DB와 완전히 같음(DB 테스트). 서버가 거절하면 로컬 재생을 지우고 상태를 다시 읽는다.
- **검사 결과(실제):** `tsc` 통과, 단위 54개 통과, DB 18개 통과(`pgtest` 사용자로 실행 — root로는 initdb가 거부), Supabase duri-dev에 마이그레이션 3개 적용 → 새 함수 8개·제약 2개의 원문 해시가 로컬과 일치(guess_draw·watch_set_video 2개는 SQL 편집기에 붙일 때 본문 안 `--` 주석이 빠졌을 뿐, 주석 줄을 지운 해시가 6d58de65·79ed2989로 일치), 단어 300/300 영어, member_prefs RLS 켬·직접 수정 불가·anon 함수 실행 불가. 로컬에서 파일 영상 어댑터(재생·+10초·일시정지·20초에서 불러오기), 영어 홈·로그인·개인정보 화면, 언어 쿠키 365일 확인.
- **미확인:** 실제 Vimeo 재생(이 환경에서 vimeo.com 접속 불가), 휴대폰에서 설정·골프 감각, 한국어·영어 외 언어(사전 파일을 추가하면 됨), Netflix 같은 DRM 서비스는 원리상 불가, 도메인·스토어 등록(Sam 계정 필요).
- 다음 행동 하나: Sam이 도메인을 고르고 구매 → `docs/RELEASE.md` 3번 표 순서대로 연결 → `npm run extension:release https://새도메인`으로 만든 zip을 Chrome 웹 스토어에 “비공개”로 올리기.

### P8 앨범·방 배경·비밀번호 로그인·넷플릭스·도우미 제거 · 2026-11-14

- **요청(Sam):** 앨범 + 앨범 사진으로 방 배경(두 사람 같은 배경), 넷플릭스 같이 보기(한 계정 공유는 불가 → 각자 자기 넷플릭스 + 확장이 맞춤으로 결정), 도우미 잠시 제거, 이미지 같은 로그인(이메일+비밀번호, 계정 만들기, 비밀번호 찾기, Google 버튼), Apple 로그인은 빼기(Apple 개발자 등록 필요), GitHub 공유한 사람 편집 권한.
- **변경 경로:** `supabase/migrations/202611150001_album.sql`(room_photos, couple_rooms.wallpaper, add/delete/set 함수, 비공개 Storage 버킷·정책 3개, 닫힌 방 앨범 정리), `202611150002_watch_netflix.sql`, `src/core/album.ts`, `src/app/api/photo/[id]/route.ts`, `src/app/room/album/{page,album}.tsx`, `src/app/room/{actions,room-shell,room-live,room-tabs}.tsx?`, `src/app/login/{actions,auth-ui,password-field}.tsx?`·`page.tsx`·`forgot/`·`reset/`, `src/app/signup/page.tsx`, `src/app/auth/callback/route.ts`(recovery), `src/core/{auth-paths,watch}.ts`, `src/app/room/watch/{players,watch-together}.tsx?`, `extension/{background,netflix-player,netflix-bridge,duri-bridge}.js`, `extension/manifest.json`(0.3.0), `scripts/{build,release}-extension.mjs`, `src/app/privacy/page.tsx`, 삭제: `src/app/room/helper/`, `src/core/recommend.ts`, `tests/unit/recommend.test.mjs`. 패키지 추가: `react-icons`(Google 버튼의 G 마크).
- **검사 결과(실제):** `tsc` 통과, 단위 56개, DB 20개(새: 앨범 권한·200장 제한·배경 공유·삭제 시 배경 해제·닫힌 방 정리, 넷플릭스 링크) 통과. 로컬 브라우저: 넷플릭스 중계 테스트 통과(가짜 넷플릭스 페이지에 seek 125000ms·play·pause 전달, 잘못된 명령·음수·거대 위치 버림, /room/chat에서는 다리 없음, 넷플릭스 탭 닫으면 연결 끊김 알림), 실제 확장 팝업 테스트 통과. 로그인 화면 휴대폰(ko·en)·데스크톱 스크린샷 확인, 가로 스크롤 없음. Supabase: 두 마이그레이션 적용, 새 함수 6개 원문 해시 로컬과 일치, 버킷 비공개·5MB·jpeg/webp, 정책 3개, room_photos RLS 켬·직접 쓰기 불가·anon 실행 불가, 비밀번호 최소 길이 6→8, 가입 허용·이메일 확인 켬, 리디렉션 `/**` 확인.
- **CI(실제, 커밋 723ffcb):** `Check starter` 통과(단위 56·DB 20·브라우저 6, 넷플릭스 중계 포함, 건너뜀 0), `live flow` 통과 2개(2.9분): 앨범 올리기 → 상대도 보임 → B가 배경 지정 → A 화면 실시간 반영 → 제3자 `/api/photo` 404 → 공개 주소 거부 → A 삭제 → 배경 꺼짐 → Storage 폴더 비어 있음, 비밀번호 로그인·틀린 비밀번호 안내·가입 검사. 테스트가 잡은 버그 1개: 배경 지정 뒤 사진 보기 창이 열린 채 화면을 막음 → 제출 때 닫도록 수정.
- **미확인:** 실제 넷플릭스(계정 필요, Sam이 직접), 비밀번호 찾기·가입 확인 메일 실제 수신(Supabase 기본 메일은 시간당 발송 수가 아주 적음 → 사용자가 늘면 Resend 같은 SMTP 연결 필요), 휴대폰에서 앨범 올리기(아이폰 HEIC는 Safari에서는 되지만 다른 브라우저는 안 될 수 있음), GitHub 협업자 권한(Sam의 이메일 인증 필요).
- 다음 행동 하나: Sam이 GitHub 설정의 이메일 인증을 마치면 협업자 권한 확인, 그다음 두 컴퓨터 Chrome에 새 확장(0.3.0)을 설치해 넷플릭스 같은 작품으로 실제 같이 보기.

### 질문 엽서, 엽서 짝맞추기, 채팅방 통화 · 2026-11-14

- 방 시간대의 오늘 날짜로 14개 질문을 순환하고, 질문을 대화창에 가져와 직접 답을 보낸다. 같은 날 같은 12장으로 각자 기억력 게임을 하고 원할 때 기록을 채팅에 보낸다. 캐릭터는 홈페이지·방 홈·게임·0.4.0 확장 팝업에 적용했다.
- 채팅 중 상대의 수락 후 WebRTC로 음성 또는 영상을 보낸다. 전송용 DB 함수는 현재 멤버십을 확인하고 발신자를 인증 세션에서 정한다. 기기 간 직접 연결과 Google STUN만 사용한다. 통화 중 탭을 떠나면 종료된다.
- 검증: 로컬 typecheck·프로덕션 빌드, 단위 57개·DB 21개, 확장 출시 ZIP 생성. 브라우저 테스트에는 합성 마이크·카메라를 사용하는 두 기기 시나리오가 들어 있다. 이 작업 환경에서 Chromium 시작이 차단되어 브라우저 결과는 PR의 GitHub Actions를 확인한다.
- 다음 작업: 대상 Supabase에 `supabase/migrations/202611160001_call_signals.sql`을 적용하고, 두 기기로 서로 다른 네트워크에서 실제 통화와 권한 거부를 확인한다. Chrome Web Store 제출은 별도다.

### 통화 소리 문제 · 2026-11-14

- **증상(Sam):** 음성·영상 통화에서 목소리가 안 들림.
- **원인:** STUN만 있고 중계(TURN) 서버가 없음 → 다른 네트워크 사이에서 연결 실패. 기존 테스트는 같은 기계 두 탭이라 항상 통과.
- **변경:** `src/core/ice.ts`, `src/app/api/call/ice/route.ts`, `src/app/room/chat/{call-session.ts,chat.tsx,call-controls.tsx}`(통화마다 서버 목록 받기, 연결 경로 "직접/중계" 표시), `tests/unit/ice.test.mjs`, `tests/flow/two-users.spec.ts`(실제 사이트에서 음성 통화 → 양쪽 소리 재생 확인 → 끊기), `playwright.flow.config.ts`(가짜 마이크·카메라).
- **검사:** 단위 59개, 기존 통화 브라우저 테스트 통과(로컬). 라이브 흐름은 CI 결과 참조.
- 다음 행동 하나: Sam이 Cloudflare 계정에서 TURN 키를 만들고 Vercel에 두 환경 변수를 넣기 → 다른 네트워크(한 명은 모바일 데이터)에서 통화해 "중계 서버를 거쳐 연결됐어요"가 뜨는지 확인.

### 통화 중계(TURN) 연결 확인 · 2026-11-15
- 변경 경로: `src/app/api/call/ice/route.ts`(중계를 못 쓰는 이유를 Vercel 로그에 남김, 키·토큰은 기록하지 않음), `tests/flow/two-users.spec.ts`(배포마다 TURN만으로 후보를 모아 중계 서버 응답 확인).
- 실제 검사: Vercel에 `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`(Production, 비밀) 확인. 처음엔 계정 API 토큰(`cfut_`)을 넣어 Cloudflare가 HTTP 401 → TURN 키 자체의 API 토큰으로 교체 후 live flow `relay servers: true relay candidate: true`, 2 passed. Check starter 통과.
- 미확인: 실제로 서로 다른 네트워크(한 명은 모바일 데이터)에서의 통화.
- 다음 행동 하나: Sam이 모바일 데이터로 통화해서 "중계 서버를 거쳐 연결됐어요" 또는 "직접 연결됐어요"가 뜨고 소리가 들리는지 확인.

### 생일 · 2026-11-15
- 변경 경로: `supabase/migrations/202611180001_birthday.sql`(member_prefs.birthday 'MM-DD', set_my_birthday, 알림 트리거), `src/core/dates.ts`(Birthday, isMonthDay, upcomingMilestones 3번째 인자), `src/lib/room-names.ts`(roomNames에 생일, birthdaysOf), `src/app/room/actions.ts`(setBirthday), `src/app/room/settings/page.tsx`(#bday 칸), `src/app/room/page.tsx`, `src/app/milestone-rail.tsx`, i18n 14개, `src/app/privacy/page.tsx`, `src/app/globals.css`.
- 규칙: 다른 기념일과 같이 100일 안(오늘 포함, 정확히 100일까지)일 때만 홈 "다가오는 기념일"에 보임. 상대 생일은 내가 정한 애칭으로("곰돌이 생일"), 없으면 "상대 생일". 2월 29일은 평년에 2월 28일. 태어난 해는 받지도 저장하지도 않음.
- 실제 검사: 단위 61 통과(생일 2개 추가), DB 23 통과(생일 권한·검증·알림), 타입 검사 통과. Supabase에 마이그레이션 적용 후 칸·함수·권한(anon 불가)·트리거·검사 규칙 확인. 로컬 빌드는 이 환경에서 Google 글꼴을 못 받아 CI 빌드로 확인.
- 미확인: 상대가 생일을 저장했을 때 내 홈이 바로 바뀌지는 않음(새로 열면 보임).
- 다음 행동 하나: Sam이 설정 → 생일에 날짜를 넣고 홈 목록에 뜨는지 확인.

### 숫자야구 · 2026-11-22
- 변경 경로: `supabase/migrations/202611220001_number_baseball.sql`(duri_private.baseball_games, baseball_state/baseball_action, 새 경기 요청에 'baseball' 추가), `src/core/baseball.ts`, `src/app/room/game/baseball-game.tsx`, `src/app/room/game/page.tsx`, `src/app/globals.css`, i18n 29개, 가이드 문구.
- 규칙: 각자 서로 다른 숫자 3개(0~9) 비밀로 정함 → 번갈아 추리, 서버가 S/B/OUT 판정 → 먼저 시작한 사람이 3S면 상대에게 마지막 1번(둘 다 맞히면 무승부) → 각자 최대 20번. 시작 순서는 판마다 바뀜, 전적 유지.
- 실제 검사: 단위 65 통과(숫자야구 3개), DB 32 통과(비밀 숫자 비공개·차례·리비전 중복 무시·마지막 기회·무승부·20번 한도·전적·제3자 차단, PL/pgSQL 채점과 TS 채점 100쌍 일치), 타입 검사 통과. Supabase 적용 전 respond_new_game/game_fingerprint 본문 해시가 포커 마이그레이션과 같음을 확인 후 적용, 권한·채점 확인.
- 미확인: 휴대폰 두 대로 실제 한 판(CI live flow가 대신 확인).
- 다음 행동 하나: Sam이 게임 → 숫자야구에서 새 경기 요청 → 상대 수락 → 한 판 끝까지 해 보기.

### 작은 창 속도 · 저장소 정리 · 2026-11-23
- 원인: 툴바 팝업은 열 때마다 /room을 처음부터 다시 받음. 그때마다 proxy·페이지·토큰 API가 각각 `getUser()`로 Supabase Auth에 왕복(한 번 110~314ms).
- 변경 경로: `src/proxy.ts`(getClaims + `Server-Timing: auth`), `src/lib/room-render.ts`(getClaims → `{ id }`), `src/app/api/session/token/route.ts`(getClaims), `tests/fixtures/room-render.mjs`, 새 측정 `tests/flow/speed.spec.ts`. 데이터를 바꾸는 서버 동작은 그대로 getUser.
- 실제 검사(live flow, 같은 조건): 로그인 확인 110~314 → 1~2ms, 방 표시 466~647 → 238~335ms, 실시간 연결 672~1246 → 315~517ms, 토큰 API 475 → 49ms. 전체 CI 통과.
- 정리: 영어 README(채용 검토용), 낡은 docs/PROMPT.md·SESSION.md 삭제. gitleaks로 전체 기록·모든 브랜치·PR 검사: 유출 0.
- 미확인: 콜드 스타트(한동안 안 쓴 뒤 첫 요청)는 CI에서 안 잡힘. GitHub 브랜치 삭제·공개 전환은 세션 권한 밖이라 Sam 로그인 필요.
- 다음 행동 하나: Sam이 툴바 아이콘을 여러 번 열어 보고 체감 속도 확인.

### Thomas 코드(체스·함께 그리기) 합치기 · 2026-11-23
- 출처: Thomas가 보낸 폴더 = PR #5(`feature/chess-smoothness-ext-draw`, 7dfe1c1)와 내용 동일(줄바꿈만 다름). 브랜치 전체(앱 부드러움 개선 포함)를 main에 병합.
- 충돌 10개: 방 정보 읽기를 Thomas의 `room-context`(getUser) 대신 main의 `room-render`(getClaims, 더 빠름)로 통일. 게임 페이지는 체스+숫자야구 둘 다. 안내 문구·번역은 양쪽 합침.
- 발견한 문제: 체스와 숫자야구 마이그레이션이 각자 공용 새 경기 함수를 덮어써서, 둘 다 적용하면 체스 새 경기 수락이 'Invalid game'. → `202611230001_games_chess_and_baseball.sql`로 두 게임을 모두 아는 버전 확정(이 파일 없이 DB 테스트 실패, 있으면 통과 확인).
- 뺀 것: 함께 그리기의 "확장 프로그램 연결" 토큰 UI와 `/api/sketch`. 받을 확장 코드가 없었고(origin.js·tokens.css 없음), 지금 팝업은 로그인된 /room/draw를 그대로 보여 줘서 필요 없음. DB 토큰 함수는 테스트와 함께 그대로.
- 실제 검사: 타입 검사, 단위 75, DB 34 통과. Supabase에 3개 마이그레이션 적용 후 테이블 6개 RLS 켜짐, anon 실행 불가, 새 경기 함수가 chess·baseball 모두 앎 확인. live flow에 체스(e2-e4 실시간)와 함께 그리기(선 실시간·새로고침 유지) 단계, 작은 창 테스트에 탭 7개·게임 8개·그림 탭 통화 유지 추가.
- 다음 행동 하나: Sam과 상대가 체스 한 판, 함께 그리기 한 장 해 보기.

### Toolbar chat input and startup · 2026-11-23
- Root cause: the chat history used 72svh without subtracting navigation and the fixed idle call panel; automatic scrollIntoView could scroll the entire iframe.
- Changes: compact.css bounds Chat to the available frame height, keeps its composer outside history scrolling, and uses two navigation rows; chat.tsx scrolls only history, preserves reading position, and guards Korean IME submission. CallControls reduces idle popup calls to a single small-window handoff. popup.js caps preference startup waiting at 100ms, uses a presentation-only cache, and handles unsuccessful handoff replies; app-bridge deduplicates surface messages. Extension release 0.5.3.
- Local validation: TypeScript and production build pass; 75 existing unit tests plus 2 new startup tests pass; 34 DB tests pass. Component fixture compiles. Local Chromium cannot start because this workspace blocks its socket operation; browser assertions must run in GitHub CI before release.
- New regressions: actual Chat/CallControls at 440×554 (English/Korean), 460×600 and 320×500; composer hit-testing, keyboard send, IME, old-message scrolling, incoming replies, visible failures. Native live flow now checks the composer position BEFORE Playwright can auto-scroll it.
- Final CI validation: commit f465426, run https://github.com/Samuel0720-source/duri-chrome-starter/actions/runs/45310164629 — TypeScript, build, 77 unit, 34 DB and 12 browser tests passed with no skips. All four compact sizes/languages passed typing, composition, reply/scroll races, errors and expanded-dock hit tests. Reviewed the captured layout screenshots. Production dependency audit: zero known vulnerabilities. ZIP 0.5.3 validated (25 files, 162665 bytes); no new permissions.
- The first browser run exposed smooth-scroll interference and a reply-before-scroll-event race. Removed programmatic scroll animations and sample the current history position before merging a reply. Component fixture now includes base.css and UTF-8 metadata.
- Updated docs/COMPACT-EXTENSION.md and docs/RELEASE.md: seven tabs, 0.5.3 installation, accurate storage/host/data disclosures, and explicit device/store review checks. CI uploads synthetic-layout screenshots for review.
- Next action: install 0.5.3 and check cold first-open timing on Sam's Mac plus a real call across different networks. The existing live-flow workflow validates authenticated two-person behavior after the production deployment; it creates and cleans up only its own temporary accounts. Chrome Web Store submission/approval is separate.

- Live deployment verification (6bc99b6): production `/api/version` matched the merge; authenticated native popup home displayed in 961ms in CI, warm room renders 285–385ms. Three of four live scenarios passed; compact flow reached its last voice-call reconnect before a five-second assertion expired. ICE gathering can take 4.5 seconds per peer, so the check now allows 30 seconds and requires active audio playback on BOTH peers. This test adjustment changes no production behavior; final rerun must pass before claiming the entire live suite succeeded.

- Final live rerun PASSED on 2081980: https://github.com/Samuel0720-source/duri-chrome-starter/actions/runs/45311499201 — all 4 scenarios passed, including the native authenticated popup (943ms observed), chat typing/sending, albums, theme/language, all game-tab layouts, persistent video/audio through navigation, poker/rematches, subsequent voice-call playback on both peers, logout cleanup, full two-person flow, and password checks. TURN relay candidate also confirmed. Check starter on the same commit passed: https://github.com/Samuel0720-source/duri-chrome-starter/actions/runs/45311499271 . These are CI measurements with synthetic media, not a Mac cold-start or physical-device certification. Install 0.5.3, verify those device checks, and finish the store disclosures/review before public publication. This final note changes documentation only; application and extension bytes are unchanged.
