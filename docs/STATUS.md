# 현재 상태 · 다음 세션이 처음 읽을 파일

**현재 단계는 P1, ‘Chrome에서 열기’입니다.** 앱 주소의 기본값은 로컬 `http://localhost:3000`입니다. 공개 HTTPS 배포와 실제 커플 계정은 이후 단계입니다.

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
