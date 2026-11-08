# 둘이 · Claude Code 작업 지침

둘이는 한국어 2인 커플 앱이다. Chrome 팝업에서 기념일을 보고 작은 창이나 전체 웹앱으로 이동할 수 있다. 설치형 웹앱(PWA)과 URL로 연 웹은 같은 코드와 방을 사용한다. 제품 내 AI 데이트 도우미와 개발용 Claude Code는 별도다.

## 첫 3분

1. 매 세션 `docs/STATUS.md`에서 현재 단계·검증 결과·다음 작업 하나를 확인한다.
2. `docs/PHASES.md`에서 그 단계의 통과 기준을 읽고, 아래 표에서 해당 경로만 연다. `docs/PRODUCT.md`는 해당 기능 부분만 확인한다.
3. 실제 코드·테스트를 확인한 뒤 사용자 행동 하나와 실패 사례를 정한다. 계획은 `phase-planner`, 권한 변경은 `data-reviewer`, 실행은 `qa-runner`에 맡길 수 있다. 파일 수정과 결과 통합은 메인 세션이 맡는다.
4. 기존 저장소에 적용했다면 원래 지침과 실행 명령부터 대조한다. 상태 문서의 예정 항목은 실제 경로나 통과한 검사로 확인한다.

## 작업에 맞는 파일 찾기

| 바꾸는 것 | 소스 | 가장 가까운 검사 |
|---|---|---|
| 툴바 팝업·Chrome 권한·전체 웹 연결 주소 | `extension/`, `scripts/build-extension.mjs` | `tests/browser/extension.spec.ts` |
| 웹 홈·소형 창·PWA 설치 | `src/app/page.tsx`, `src/app/compact/page.tsx`, `src/app/preview.tsx`, `src/app/manifest.ts`, `public/sw.js` | `tests/browser/pwa.spec.ts`, `extension.spec.ts` |
| 날짜·화면 사이 데이터 전달 | `src/core/dates.ts`, `src/core/preview.ts` | `tests/unit/calendar.test.mjs`, `tests/unit/preview.test.mjs` |
| 이메일 인증·초대·RLS·종료 | `supabase/migrations/`, `docs/POLICIES.md` | `tests/database/rooms.test.mjs`, P2의 실제 2인+제3자 검사 |
| 게임·YouTube·AI | `docs/PRODUCT.md`, `docs/POLICIES.md`, `docs/ARCHITECTURE.md`, `src/core/playback.ts` | 현재 단계의 검증 항목을 PHASES에서 확인 |

## 고정 결정

- Next.js App Router + TypeScript, Supabase Auth/Postgres/Realtime, Vercel을 사용한다. 재접속은 DB의 마지막 확정 상태에서 이어간다. 리비전과 요청 ID로 중복 입력을 처리한다.
- 확장은 `src/core/`의 순수 함수를 빌드 시 복사한다. `dist/chrome-extension/`은 출력물이다. 팝업에는 사용자가 기억하도록 선택한 날짜와 시간대만 저장한다. 로그인·초대·채팅·비밀 게임 답은 웹의 인증된 경로만 취급한다.
- 비밀키는 서버에만 둔다. 확장 권한을 추가하거나 새로운 외부 유료 호출을 설계할 때에는 구체적인 사용 이유·범위·검사를 ARCHITECTURE에 적는다. P1의 외부 API 예산은 CAD 0이다.
- 현재 세션에서 실제로 등록된 스킬 중 이번 작업에 맞는 것만 사용한다. UI 작업에 Hallmark 또는 UI UX Pro Max, 검토 작업에 ECC 등을 설명과 맞을 때 적용한다.

## 명령과 인계

`npm run dev`는 웹, `npm run extension:build`는 확장, `npm run typecheck`는 타입, `npm test`는 단위·DB·빌드·브라우저 전체 검사다. 처음 브라우저 실행 시 README의 Chromium 설치 단계를 따른다.

작업 끝에 STATUS에 변경 경로, 실제 검사 결과, 미확인 항목, 다음 행동 한 가지를 남긴다. 단계가 끝나면 ARCHITECTURE에 데이터 흐름·설계 이유·면접에서 설명해 볼 질문 하나를 적는다. 공유한 프리뷰는 직접 연 주소만 기록한다.

