# 둘이 · Chrome과 Claude Code 프로젝트 템플릿

처음에는 **Chrome 아이콘에서 첫날을 고르고 → 작은 창에서 날짜를 확인하고 → 전체 웹앱을 여는 것**까지 해 보세요. 이 한 가지 행동은 계정이나 API 키 없이 실행됩니다. 첫날과 시간대가 세 화면 사이에서 어떻게 전달되는지 코드로 따라갈 수 있습니다.

| 열고 싶은 화면 | 들어가는 곳 | 할 수 있는 일 |
|---|---|---|
| 도구 모음 팝업 | Chrome에 고정한 ‘둘이’ 아이콘 | 기념일 확인. 원하는 경우 첫날과 시간대만 이 기기에 기억 |
| 독립된 작은 창 | 팝업의 **작은 창으로 열기** | 약 420 × 680 창에서 날짜 수정. 상단의 **전체 웹앱 열기**로 그대로 이어가기 |
| 전체 웹앱 | 팝업의 **전체 웹앱 열기** 또는 웹 주소 | 작은 휴대폰부터 큰 데스크톱까지 같은 웹으로 사용 |
| 설치한 웹앱(PWA) | 전체 웹을 연 Chrome의 설치 메뉴 | Dock이나 앱 목록에서 별도 창으로 실행. URL로 접속도 가능 |

GitHub나 Vercel 계정은 로컬에서 시작하는 데 필요하지 않습니다. 실제 이메일 로그인·두 사람의 공유방·게임은 다음 단계입니다.

## 1. 맥에서 프로젝트 열기

1. ZIP을 다운로드하고 Finder에서 더블클릭하세요. 압축이 풀린 **duri-chrome-starter** 안에 `README.md`, `package.json`, `CLAUDE.md`가 보이면 여기가 프로젝트의 맨 위 폴더입니다. Finder에서 `⌘ + Shift + .`을 누르면 숨겨진 `.claude`도 보입니다.
2. `⌘ + Space` → `터미널`을 입력해 실행하세요. 아래 명령을 한 줄씩 입력하고 Return을 누르세요.

```bash
cd "$HOME/Downloads/duri-chrome-starter"
pwd
ls .claude/agents
node -v
npm -v
```

- `cd`는 이후 명령을 어느 폴더에서 실행할지 정합니다. 다른 위치에 풀었다면 터미널에 `cd `(마지막 공백 포함)를 입력하고 Finder의 폴더를 끌어다 놓은 뒤 Return을 누르세요.
- 세 에이전트 파일 이름과 Node 버전 `v24.x`가 보이면 준비되었습니다. Node가 없다면 공식 사이트에서 이 템플릿이 사용하는 **Node.js 24.x**의 macOS 설치 프로그램을 설치한 뒤 터미널을 다시 여세요. [Node.js 공식 다운로드](https://nodejs.org/en/download)

## 2. 웹앱 띄우기 · 터미널 A

```bash
npm ci
npm run dev
```

`npm ci`는 고정된 패키지를 설치합니다. `npm run dev`는 개발용 웹 서버를 켭니다. 이 창을 열어 둔 채 Chrome 주소창에 **http://localhost:3000**을 입력하세요. ‘우리 기념일’ 화면에서 첫날과 시간대를 바꾸고 창을 줄였다 늘려 보세요. `localhost`는 현재 사용 중인 컴퓨터를 뜻합니다. 휴대폰이나 상대의 맥에서 접속할 때는 배포한 HTTPS 주소를 사용합니다.

## 3. Chrome 툴바에 둘이 추가하기 · 데스크톱 Chrome

1. Chrome 주소창에 `chrome://extensions`를 입력하세요.
2. 오른쪽 위 **개발자 모드**를 켜고 **압축해제된 확장 프로그램을 로드합니다**(Load unpacked)를 누르세요.
3. 압축을 푼 프로젝트 안의 **`dist/chrome-extension`**을 선택하세요. 이 폴더 바로 안에 `manifest.json`이 있습니다. ZIP에는 바로 불러올 수 있는 버전이 들어 있습니다.
4. 주소창 옆 퍼즐 아이콘 → ‘둘이 · 기념일’ 옆 핀을 누르세요. ‘둘이’ 아이콘을 클릭해 첫날을 고릅니다. **이 기기에 날짜와 시간대 기억**을 켜면 다음 클릭 때도 값이 남고, 끄면 저장된 값이 삭제됩니다.
5. **작은 창으로 열기**를 눌러 보세요. 작은 창에서 날짜를 바꾼 다음 **전체 웹앱 열기**를 누르면 선택한 값이 새 탭에 이어집니다. 툴바 팝업의 **전체 웹앱 열기**로도 바로 갈 수 있습니다. [Chrome 확장 로드와 고정](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)

확장에 들어 있는 기본 웹 주소는 `http://localhost:3000`입니다. 개발 서버 로그가 다른 포트(예: 3001)를 표시하면 **새 터미널에서 같은 프로젝트 폴더로 이동**해 `npm run extension:build -- http://localhost:3001`을 실행하고 확장 관리 화면에서 ‘둘이’의 새로고침 버튼을 누르세요. 배포 후에는 이 명령의 주소를 확인된 HTTPS 배포 주소로 바꿉니다. 소스는 `extension/`과 `src/core/`에서 수정하고 `npm run extension:build`로 다시 생성하세요. 테스트는 별도 임시 폴더에 확장을 빌드합니다.

## 4. 웹앱을 Dock에서 열기 · PWA

터미널 A에서 `Control + C`를 눌러 개발 서버를 멈추고 다음을 실행하세요.

```bash
npm run build
npm start
```

1. Chrome에서 웹앱 주소를 다시 열고 **앱 설치**를 누르세요. 주소창에 설치 아이콘이 있으면 그 아이콘을 눌러도 됩니다.
2. 버튼에 브라우저 안내가 뜨면 Chrome 오른쪽 위 **⋮ → 전송, 저장 및 공유 → 페이지를 앱으로 설치**를 선택하세요. 설치 창에서 ‘둘이’를 확인하고 설치를 마치세요.
3. 새로 열린 독립 창을 좁게, 넓게 바꿔 보세요. 설치 후에도 브라우저 탭과 독립 창은 같은 웹앱을 사용합니다. 로컬 설치를 시험할 때는 서버를 켜 두세요. 이 단계의 프로덕션 서비스 워커는 공개 오프라인 안내만 캐시합니다. [Chrome 설치 안내](https://support.google.com/chrome/answer/9658361?hl=ko) · [Next.js PWA](https://nextjs.org/docs/app/guides/progressive-web-apps)

## 5. 실제 Claude Code 에이전트 열기

**화면으로 시작**하려면 Claude 데스크톱 앱에서 **Code → Local → 폴더 열기**로 `duri-chrome-starter`를 고르세요. 다음 절의 한국어 메시지를 해당 Code 세션에 입력하면 됩니다. 개발 서버는 터미널 A에서 계속 실행합니다. [Anthropic 데스크톱 시작 안내](https://code.claude.com/docs/en/desktop-quickstart)

**터미널로 시작**하려면 `⌘ + N`으로 터미널 B를 엽니다. `claude --version`에 버전 번호가 뜨면 설치를 건너뛰세요. 설치가 필요한 경우 Anthropic이 제공하는 macOS 명령은 다음과 같습니다.

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

설치 후 새 터미널에서 아래 세 줄을 실행하세요. 처음 실행하면 브라우저에서 Claude Code를 지원하는 Claude 계정 또는 Anthropic Console로 로그인하고 터미널로 돌아옵니다. ChatGPT 구독과 Anthropic 계정은 별도입니다. `claude`를 찾지 못하면 설치기가 안내한 PATH를 적용한 뒤 터미널을 다시 여세요. [Anthropic 설치와 로그인](https://code.claude.com/docs/en/quickstart)

```bash
cd "$HOME/Downloads/duri-chrome-starter"
claude --version
claude
```

### Claude Code 입력칸에 붙여 넣기

아래 첫 메시지는 Claude의 대화 입력칸에서 보냅니다. `@`를 입력하고 목록의 **phase-planner (agent)**를 선택한 뒤 나머지 문장을 입력하면 해당 역할로 작업을 맡길 수 있습니다. 이름을 한국어 문장에 적는 방법도 있습니다. [서브에이전트 호출](https://code.claude.com/docs/en/sub-agents)

> phase-planner 에이전트를 사용해. CLAUDE.md와 docs/STATUS.md를 읽고, Chrome 아이콘 → 작은 창 → 전체 웹앱으로 이어지는 데 관여하는 실제 파일과 검사 명령을 알려줘. 1단계에서 내가 다음에 할 일 한 가지만 제안해. 이번 메시지는 읽기와 계획까지야.

다음에는 메인 Claude Code에 이렇게 요청하세요.

> qa-runner 에이전트에게 지금 환경에서 npm test를 맡겨 줘. 실패하면 재현 조건을 찾고, 메인 세션에서 필요한 부분만 고친 후 다시 검사해. 실제로 통과한 항목과 내가 맥에서 직접 눌러 봐야 할 항목을 docs/STATUS.md에 적어 줘.

| 역할 | 맡기는 일 | 결과물 |
|---|---|---|
| 메인 Claude Code | 구현·수정·인계 기록 | 검토할 변경 사항과 다음 작업 한 가지 |
| phase-planner | 현재 단계의 관련 코드와 테스트 읽기 | 사용자 행동, 변경 후보 파일, 통과 기준 |
| data-reviewer | 초대 경쟁·제3자 접근·탈퇴·삭제 검토 | 어떤 계정으로 어떻게 재현하는지와 관련 경로 |
| qa-runner | 프로젝트 테스트 실제 실행 | 명령, 통과·실패, 아직 확인할 항목 |

에이전트 목록이 보이지 않으면 터미널에서 `pwd`와 `ls .claude/agents`를 확인하고 해당 루트에서 새 세션을 여세요. CLI의 `/agents` 화면은 버전에 따라 안내 또는 관리 마법사입니다. 읽기 전용 계획 역할로 세션 전체를 열고 싶으면 셸에서 `claude --agent phase-planner`를 실행할 수 있습니다.

일반 Claude 웹 채팅은 설계 문서에 대해 이야기할 때 사용합니다. **브라우저만으로 코드 작업**을 하고 싶으면 GitHub에 올린 저장소(`.claude/agents` 포함)를 Claude Code 웹에서 연결하고 작업할 저장소를 선택하세요. 그 세션은 클라우드에서 복제한 코드를 수정하므로 내 맥의 아직 올리지 않은 파일·개인 설정과 상태가 다를 수 있습니다. [Claude Code 웹 열기](https://claude.ai/code) · [클라우드 환경 안내](https://code.claude.com/docs/en/claude-code-on-the-web)

**에이전트와 스킬.** 에이전트는 정해진 역할을 맡아 별도 문맥에서 결과를 돌려줍니다. 스킬은 디자인이나 검토 방법을 담은 지침입니다. 이 ZIP에는 프로젝트 에이전트 세 개가 들어 있습니다. Hallmark·ECC·Ponytail·UI UX Pro Max는 맥의 현재 세션에 실제 표시된 이름과 설명을 확인하고 필요한 단계에만 사용하세요. `~/.claude/skills/`는 개인 범위, `.claude/skills/`는 프로젝트 범위입니다. 제품 속 데이트 도우미는 P5에 구현할 별도 서비스입니다. [에이전트](https://code.claude.com/docs/en/sub-agents) · [스킬](https://code.claude.com/docs/en/skills)

## 6. 내 프로젝트에 재사용하기

| 새 세션에서 찾을 것 | 파일 |
|---|---|
| 어디에서 시작하고 어떤 명령을 쓸까? | `CLAUDE.md` |
| 어디까지 됐고 다음 할 일은 뭘까? | `docs/STATUS.md` |
| 이번 단계에 무엇을 보여 줄까? | `docs/PHASES.md` · `docs/PRODUCT.md` |
| 데이터가 어디로 이동하고 왜 그렇게 설계했나? | `docs/ARCHITECTURE.md` · `docs/POLICIES.md` |
| 어떤 문장을 입력하고 다음 세션에 무엇을 남길까? | `docs/SESSION.md` |
| 화면, 날짜 규칙, 확장 권한, SQL, 테스트 구현은 어디에 있나? | `src/app/` · `src/core/` · `extension/` · `supabase/migrations/` · `tests/` |

새 프로젝트에는 이 폴더를 사용하세요. 이미 코드가 있는 프로젝트에는 **기존 저장소의 별도 브랜치**에서 `CLAUDE.md`, `.claude/agents/`, `docs/`부터 비교·병합하고 그 프로젝트의 경로·실행 명령으로 바꾸세요. 기존 앱의 `package.json`과 DB 마이그레이션은 해당 코드와 대조해 필요한 부분만 가져오세요. 다음부터는 작업 하나당 `docs/SESSION.md`의 빈 작업 카드를 복사하면 됩니다. [프로젝트 지침 파일](https://code.claude.com/docs/en/memory)

## 7. 자동 검사와 실제 배포

처음 한 번 이 프로젝트 폴더에서 `npx playwright install chromium`을 실행하세요. 자동 확장 테스트에는 Playwright의 Chromium을 사용합니다. 브라우저 일반 Chrome에서는 위 3단계로 확장을 직접 열어 봅니다. [Playwright의 확장 테스트](https://playwright.dev/docs/chrome-extensions)

```bash
npm run typecheck
npm test
```

| 명령 | 검증 범위 |
|---|---|
| `npm run test:unit` | 날짜·영상 보정 규칙, 작은 창과 전체 탭에 전달하는 값, 확장 대상 주소 |
| `npm run test:db` | 임시 로컬 PostgreSQL의 독립 연결로 초대 동시 수락, 제3자 읽기·쓰기 거절, 방 종료 알림 |
| `npm run build` | 웹앱의 프로덕션 빌드 |
| `npm run test:e2e` | 프로덕션 서버를 띄워 두 브라우저 컨텍스트, 4개 뷰포트, manifest·아이콘·오프라인 화면, 확장 → 작은 창 → 전체 웹 흐름 검사 |
| `npm test` | 단위 → DB → 빌드 → 브라우저. E2E만 따로 실행할 때는 웹앱을 먼저 빌드 |

DB 테스트는 로컬에서만 열리는 임시 DB에 인증 ID를 제공해 실행합니다. Supabase 계정과 Docker는 필요 없습니다. 실제 이메일 로그인, 호스팅한 비공개 Realtime 채널, 다른 맥 또는 휴대폰으로 초대하는 과정은 P2의 별도 테스트입니다.

브라우저 검사는 임시 프로필에서 PWA를 설치·실행하고 독립 창을 확인한 뒤 제거합니다. 팝업은 두 번 검사합니다. 첫 검사는 Chrome의 저장·창 열기 API를 테스트용으로 대체해 배포 파일과 실제 웹 화면 사이의 동작을 확인합니다. 두 번째 검사는 실제 확장을 로드해 같은 경로를 확인합니다. 관리 정책이 로컬 확장 설치를 막는 환경에서는 두 번째 검사에 `skipped`가 표시됩니다. 개인 개발 환경에서 `REQUIRE_NATIVE_EXTENSION=1 npm test`를 실행하면 이 항목도 반드시 통과해야 합니다. 포함된 CI도 이 모드를 사용합니다. 이 템플릿에서 실제로 확인한 항목은 `docs/STATUS.md`에 적었습니다.

**공개 주소를 만드는 순서**는 저장소 → Vercel의 Next.js 프리뷰 → HTTPS 주소 직접 확인 → 확장을 그 주소로 다시 빌드입니다. P2부터 Supabase 테스트 프로젝트의 인증 콜백·테이블·접근 권한을 연결합니다. `.env.example`은 키의 위치를 설명합니다. P1은 외부 API 키 없이 동작합니다. Chrome 웹 스토어에 배포할 때는 **배포 주소용으로 생성한 `dist/chrome-extension` 안의 내용**을 별도 ZIP으로 묶어서 제출합니다. 프로젝트 전체 ZIP은 개발용입니다. [Vercel 도메인](https://vercel.com/docs/domains/set-up-custom-domain) · [Chrome 웹 스토어 제출](https://developer.chrome.com/docs/webstore/publish)

