# 출시 체크리스트 · 확장 배포와 도메인

## 1. Chrome 웹 스토어에 올릴 파일 만들기

```bash
npm run extension:release                        # 지금 주소: https://duri-chrome-starter.vercel.app
npm run extension:release https://내도메인.ca     # 도메인을 연결한 뒤
```

- 결과: `dist/duri-extension-<버전>.zip`과 sha256. https 주소만 허용(localhost 거부).
- 묶기 전에 검사: Manifest V3, 버전 형식, 권한은 `storage`만, `host_permissions`는 Duri의 고정 origin만, 콘텐츠 스크립트는 Netflix watch 페이지와 Duri origin에서만, 백그라운드는 서비스 워커 하나, 아이콘 16/32/48/128, `_locales/en`·`_locales/ko`.
- 새 버전을 올릴 때마다 `extension/manifest.json`의 `version`을 올린다(스토어는 같은 버전을 거부).

## 2. 스토어 제출 (Sam만 할 수 있는 일)

1. Chrome Web Store 개발자 대시보드에 Google 계정으로 등록한다(일회성 등록비가 있다. 금액은 대시보드에서 확인).
2. **새 항목 → zip 업로드.**
3. 스토어 등록 정보: 이름/설명은 `_locales`의 영어·한국어 문구, 스크린샷 1280×800 1장 이상(팝업 화면), 아이콘 128px.
4. **권한 설명(storage):** “마지막 화면·언어·테마만 기기에 저장하고, 열린 작은 창의 번호를 브라우저 세션 동안 기억합니다. 대화·사진·로그인 토큰을 확장 저장소에 복사하지 않습니다.”
5. **사이트 접근 설명(넷플릭스·둘이):** “넷플릭스 같이 보기: netflix.com/watch 페이지에서 재생 상태·위치·작품 번호만 읽어 같은 컴퓨터의 둘이 함께 보기 페이지에 전달합니다. 계정·시청 기록은 읽지 않습니다. Duri 사이트 접근은 로그인된 방을 팝업에 표시하고 화면·언어·테마를 맞추기 위해 필요합니다.”
6. **개인정보 관행:** 실제 서비스가 취급하는 계정 정보·사용자가 작성한 대화/사진/그림·게임 기록과 통화 미디어를 기준으로 대시보드 항목을 작성한다. “데이터를 전혀 수집하지 않음”을 선택하지 않는다. 확장 코드와 웹사이트 코드를 구별한다: 확장 로직은 패키지에 있고 인증된 웹앱은 Duri origin의 iframe에서 실행된다. 개인정보처리방침 주소: `<주소>/privacy`. 심사자가 두 계정 연결·채팅·게임·통화를 검토할 수 있도록 테스트 절차를 제공한다.
7. 공개 범위는 처음엔 “비공개(링크가 있는 사람)”로 올려 직접 설치해 본 뒤 공개로 바꾼다.

## 3. 도메인(.com 또는 .ca) 연결 순서

| 순서 | 어디서 | 할 일 |
|---|---|---|
| 1 | 도메인 판매처 (Sam) | 도메인 구매 |
| 2 | Vercel → 프로젝트 → Domains | 도메인 추가, 안내된 DNS 레코드를 판매처에 입력, 인증서 발급 확인 |
| 3 | Vercel → Environment Variables | `NEXT_PUBLIC_APP_URL=https://새도메인` (Production) 후 재배포 |
| 4 | Supabase → Authentication → URL Configuration | Site URL을 새 도메인으로, Redirect URLs에 `https://새도메인/auth/callback` 추가(기존 vercel.app은 전환 기간 동안 유지) |
| 5 | Google Cloud → OAuth 클라이언트 | 승인된 JavaScript 원본에 새 도메인 추가(리디렉션 URI는 Supabase 콜백 그대로) |
| 6 | GitHub → Secrets | 흐름 테스트 주소 `FLOW_URL`을 새 도메인으로 |
| 7 | 이 저장소 | `npm run extension:release https://새도메인` → 새 버전으로 스토어 업데이트 |
| 8 | 확인 | 새 도메인에서 Google 로그인 → 초대 링크가 새 도메인으로 나오는지 → 확장 “전체 웹앱”이 새 도메인을 여는지 → 흐름 테스트 통과 |

로그인 쿠키는 도메인마다 따로라서, 도메인을 바꾸면 모두 한 번 다시 로그인한다(그 뒤로는 유지).

## 0.5.3 final checks before submission
- Install the ZIP in a clean Chrome profile, connect two test accounts, and check English/Korean Chat at 440×600. The composer must remain clickable without scrolling the whole page.
- Check first-open delay after restarting Chrome on the target Mac. The 100ms preference deadline is not an end-to-end loading-time guarantee.
- Test camera/microphone permission denial, re-enabling permissions, and a continuing small-window call on two different networks. CI uses synthetic devices.
- Confirm the public privacy page and store disclosures describe the current authenticated app, including Limited Use. The old date-only extension description is insufficient.
- Provide reviewer test instructions/accounts through the store's private review fields; never commit account credentials.
- Store approval is separate from the automated test suite. Official references: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements and https://developer.chrome.com/docs/webstore/program-policies/user-data-faq . An isolated web iframe is not blanket approval of undisclosed or unreviewable remote functionality.

## 0.5.6 store submission · copy-paste text (English dashboard)

Upload `dist/duri-extension-0.5.6.zip` only after the website commit with popup calls is live (the popup shows the live site).

- **Single purpose:** Opens the user's private two-person Duri room (chat, calls, games, photos, anniversaries) from the Chrome toolbar, and optionally syncs Netflix playback for Duri's Watch together page.
- **storage justification:** Remembers the last opened Duri screen, language and theme on this device, and the id of the optional small window for the browser session. No messages, photos or login tokens are stored.
- **Host permission (Duri site) justification:** The popup embeds the signed-in Duri website in an iframe and needs site access so the room, its cookies and its language/theme work inside the popup.
- **Content scripts (netflix.com/watch) justification:** For Watch together only: reads play/pause state, current time and the title number on Netflix watch pages and relays them to the Duri tab on the same computer. No account, password or history is read.
- **Microphone/camera:** No manifest permission. Calls run in the Duri website frame. Chrome cannot prompt inside a popup, so `permission.html` asks once in a normal tab; it stops the devices immediately and records nothing.
- **Remote code:** No. All extension JavaScript is in the package; the Duri website runs in its own origin inside an iframe without extension APIs.
- **Privacy policy URL:** https://duri-chrome-starter.vercel.app/privacy
- **Data disclosure:** Personally identifiable info (email/name for the account), personal communications (chat, calls), user-generated content (photos, drawings). Not sold, not used for unrelated purposes, not used for creditworthiness. Tick the Limited Use certifications.
- **Screenshots:** at least one 1280×800 (popup Chat tab with the call buttons, popup Home). **Icon:** `extension/icons/128.png`.
- **Reviewer notes:** provide two test accounts already in one room (private review field only) and the steps: pin Duri → open popup → Chat → Voice call; second account accepts on the website.
