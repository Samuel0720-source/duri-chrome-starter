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
