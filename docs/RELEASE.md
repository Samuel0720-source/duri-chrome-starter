# 출시 체크리스트 · 확장 배포와 도메인

## 1. Chrome 웹 스토어에 올릴 파일 만들기

```bash
npm run extension:release                        # 지금 주소: https://duri-chrome-starter.vercel.app
npm run extension:release https://내도메인.ca     # 도메인을 연결한 뒤
```

- 결과: `dist/duri-extension-<버전>.zip`과 sha256. https 주소만 허용(localhost 거부).
- 묶기 전에 검사: Manifest V3, 버전 형식, 권한은 `storage`만, `host_permissions`·`content_scripts` 없음, 아이콘 16/32/48/128, `_locales/en`·`_locales/ko`.
- 새 버전을 올릴 때마다 `extension/manifest.json`의 `version`을 올린다(스토어는 같은 버전을 거부).

## 2. 스토어 제출 (Sam만 할 수 있는 일)

1. Chrome Web Store 개발자 대시보드에 Google 계정으로 등록한다(일회성 등록비가 있다. 금액은 대시보드에서 확인).
2. **새 항목 → zip 업로드.**
3. 스토어 등록 정보: 이름/설명은 `_locales`의 영어·한국어 문구, 스크린샷 1280×800 1장 이상(팝업 화면), 아이콘 128px.
4. **권한 설명(storage):** “사용자가 ‘이 기기에 기억’을 켰을 때만, 고른 첫날과 시간대를 이 컴퓨터의 Chrome에 저장합니다.”
5. **개인정보 관행:** 개인 식별 정보·위치·웹 기록을 수집하지 않음. 원격 코드 없음(모든 코드는 패키지 안). 개인정보처리방침 주소: `<주소>/privacy`.
6. 공개 범위는 처음엔 “비공개(링크가 있는 사람)”로 올려 직접 설치해 본 뒤 공개로 바꾼다.

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
