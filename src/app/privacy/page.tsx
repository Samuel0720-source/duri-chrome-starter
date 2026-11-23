import type { Metadata } from "next";
import { getT } from "../../i18n/server";
import { LegalPage } from "../legal/legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("legal.privacy") + " | " + t("app.name") };
}

// The policy is written out in each language (legal text is not split into dictionary sentences).
export default async function PrivacyPage() {
  const { t, locale } = await getT();
  return (
    <LegalPage title={t("legal.privacy")} updated={locale === "ko" ? "2026년 11월 23일" : "November 23, 2026"}>
      {locale === "ko" ? <Ko /> : <En />}
    </LegalPage>
  );
}

function Ko() {
  return (
    <>
      <h2>모으는 정보</h2>
      <ul>
        <li><strong>로그인 정보:</strong> Google로 로그인하면 Google 계정의 이메일 주소, 이름, 프로필 사진 주소를 받아요. 이메일과 비밀번호로 가입하면 이메일 주소를 받고, 비밀번호는 원래 글자로 되돌릴 수 없는 형태(해시)로만 Supabase에 저장돼요.</li>
        <li><strong>커플방 정보:</strong> 함께한 첫날, 기준 시간대, 방 테마와 방 배경으로 고른 사진, 방에 누가 들어와 있는지, 초대 링크의 만료 시각과 사용 여부. 초대 링크 자체는 저장하지 않고 되돌릴 수 없게 바꾼 값만 저장해요.</li>
        <li><strong>두 사람이 만든 것:</strong> 약속, 대화 메시지, 서로 정한 애칭, 각자 적은 생일(월과 일만, 태어난 해는 저장하지 않음), 대화를 어디까지 읽었는지와 그 시각, 게임 답과 기록(체스 수 포함), 그림판에 함께 그린 선과 스티커, 함께 보기에 넣은 영상 링크와 재생 위치, 앨범에 올린 사진(누가 언제 올렸는지 포함).</li>
        <li><strong>앨범 사진:</strong> 올리기 전에 브라우저가 사진을 다시 그려서 크기를 줄여요. 이때 위치(GPS)·기기 같은 카메라 정보는 지워져요. 사진은 공개 주소가 없는 저장소에 있고, 방의 두 사람만 열 수 있어요.</li>
        <li><strong>알림:</strong> 상대가 방을 나갔을 때 보여 줄 안내 한 줄.</li>
        <li><strong>쿠키:</strong> 로그인 상태를 기억하는 쿠키와, 고른 언어를 기억하는 쿠키만 써요. 광고나 방문 분석용 쿠키는 쓰지 않아요.</li>
      </ul>
      <p>로그인하지 않고 첫 화면에서 날짜를 바꿔 보는 미리보기는 서버에 저장되지 않아요. Chrome 확장 팝업은 웹사이트의 로그인된 방을 그대로 열어요. 확장에는 마지막으로 연 화면, 언어와 테마만 기기에 저장하고, 작은 창의 번호는 브라우저 세션 동안 기억해요. 확장이 대화·사진·로그인 토큰을 따로 복사해 저장하지 않아요. 이전 버전에서 기억한 날짜와 시간대는 기기에 남아 있을 수 있어요. 확장을 제거하면 확장의 로컬 정보도 지워져요.</p>
      <p>넷플릭스 같이 보기를 쓰면, 확장 프로그램이 <strong>netflix.com/watch 페이지에서만</strong> 재생 중인지, 몇 초 지점인지, 작품 번호를 읽어 같은 컴퓨터의 둘이 함께 보기 페이지에 전해요. 넷플릭스 계정·비밀번호·시청 기록은 읽지 않고, 확장 프로그램이 따로 어디에 보내거나 저장하지 않아요. 두 사람의 재생 위치는 함께 보기와 똑같이 둘이 데이터베이스로 맞춰요.</p>

      <h2>쓰는 곳</h2>
      <p>로그인, 두 사람의 방 연결, 기념일 계산, 대화와 게임, 함께 보기, 그리고 상대 화면을 바로 바꾸는 데만 써요. 정보를 팔거나 광고에 쓰지 않아요.</p>

      <h2>음성·영상 통화</h2>
      <p>상대가 전화를 받은 뒤 브라우저가 마이크 사용을 요청해요. 영상 통화는 카메라도 사용해요. 음성과 영상은 두 기기 사이에서 직접, 또는 직접 연결이 어려우면 Cloudflare TURN 중계 서버를 거쳐 전송돼요. 둘이는 녹음하거나 녹화하지 않아요. 연결 정보는 Supabase의 비공개 방 채널을 거쳐요. Google의 STUN 서버, 사용 중인 중계 서버와 통화 상대에게 내 기기의 네트워크 주소가 보일 수 있어요.</p>
      <h2>맡기는 곳</h2>
      <ul>
        <li><strong>Supabase</strong> (미국 동부): 로그인, 데이터베이스, 앨범 사진 저장</li>
        <li><strong>Vercel</strong>: 웹사이트 호스팅</li>
        <li><strong>Google</strong>: Google 로그인</li>
        <li><strong>YouTube, Vimeo, 또는 영상 파일이 있는 사이트</strong>: 함께 보기에서 영상을 틀면 두 사람의 브라우저가 그 사이트에 직접 접속해요. 그 사이트는 접속한 기기의 IP 주소 같은 정보를 볼 수 있어요.</li>
        <li><strong>Netflix</strong>: 넷플릭스는 각자 자기 넷플릭스 계정으로 넷플릭스 사이트에서 봐요. 그때는 넷플릭스의 개인정보 처리방침이 적용돼요.</li>
      </ul>

      <h2>보는 사람</h2>
      <p>방의 모든 내용은 그 방의 두 사람만 볼 수 있어요. 데이터베이스 규칙이 다른 사람의 접근을 막아요.</p>

      <h2>지우기</h2>
      <p>로그인한 뒤 <strong>설정 → 계정 → 계정 삭제</strong>를 누르면 계정, 로그인 정보, 방, 초대, 알림, 애칭과 생일, 읽음 정보, 그림판에 내가 그린 선, 앨범 사진이 바로 지워져요. 방에 상대가 있었다면 상대에게는 ‘상대가 방을 나갔어요’만 보여요. ‘방 나가기’만 하면 앨범 사진을 지운 뒤 두 사람 모두 방에서 빠지고 방은 닫혀요. 앨범에서 내가 올린 사진은 언제든 하나씩 지울 수 있어요.</p>

      <h2>문의</h2>
      <p>samuelkoo0720@gmail.com</p>
    </>
  );
}

function En() {
  return (
    <>
      <h2>What we collect</h2>
      <ul>
        <li><strong>Sign-in:</strong> with Google, the email address, name and profile picture address of your Google account. With an email and password, the email address; Supabase stores the password only as a hash that cannot be turned back into it.</li>
        <li><strong>Your room:</strong> your first day, time zone, room theme and the photo chosen as the room background, who is in the room, and when an invite link expires and whether it was used. The invite link itself is not stored, only a value that cannot be turned back into it.</li>
        <li><strong>What the two of you make:</strong> plans, chat messages, the nicknames you set for each other, the birthday each of you adds (month and day only; no birth year is stored), how far each of you has read the chat and when, game answers and records (including chess moves), the lines and stickers drawn together on the drawing board, the video links and playback position used in Watch together, and album photos (with who added them and when).</li>
        <li><strong>Album photos:</strong> before upload, your browser redraws each photo at a smaller size, which removes camera data such as GPS location and device. Photos are kept in storage with no public address; only the two people in the room can open them.</li>
        <li><strong>Notices:</strong> one line telling you when your partner left the room.</li>
        <li><strong>Cookies:</strong> only one that keeps you signed in and one that remembers your language. No advertising or analytics cookies.</li>
      </ul>
      <p>The signed-out date preview is not saved on the server. The Chrome popup opens the same authenticated room as the website. The extension stores only the last screen, language and theme locally, plus a small-window identifier for the browser session. It does not separately copy messages, photos or login tokens into extension storage. Dates and time zones remembered by older versions may remain locally. Removing the extension clears its local data.</p>
      <p>For Netflix together, the extension reads <strong>only on netflix.com/watch pages</strong> whether the video is playing, its position in seconds, and the title number, and passes them to the Watch together page on the same computer. It does not read your Netflix account, password or viewing history, and the extension itself sends or stores nothing elsewhere. The two of you stay in step through the Duri database, as with any other video.</p>

      <h2>How we use it</h2>
      <p>Only to sign you in, connect the two of you, count anniversaries, run chat, games and Watch together, and update your partner's screen right away. We never sell it or use it for advertising.</p>

      <h2>Voice and video calls</h2>
      <p>After your partner accepts, your browser requests microphone access and, for video calls, camera access. Your devices exchange audio and video directly or through a Cloudflare TURN relay when a direct connection is unavailable. Duri does not record calls. Connection details pass through your private Supabase room channel. Google's STUN server, a relay in use, and your partner may see your network address.</p>
      <h2>Who we rely on</h2>
      <ul>
        <li><strong>Supabase</strong> (US East): sign-in, the database and album photo storage</li>
        <li><strong>Vercel</strong>: website hosting</li>
        <li><strong>Google</strong>: Google sign-in</li>
        <li><strong>YouTube, Vimeo, or the site hosting a video file</strong>: when a video plays in Watch together, both browsers connect to that site directly, and that site can see information such as the device's IP address.</li>
        <li><strong>Netflix</strong>: each of you watches on the Netflix site with your own Netflix account, under Netflix's privacy policy.</li>
      </ul>

      <h2>Who can see it</h2>
      <p>Everything in a room is visible only to the two people in it. Database rules block everyone else.</p>

      <h2>Deleting</h2>
      <p>After signing in, <strong>Settings → Account → Delete account</strong> deletes your account, sign-in, room, invites, notices, nicknames, birthdays, read positions, the lines you drew on the drawing board and album photos at once. If your partner was in the room, they only see "Your partner left". Leaving the room deletes the album photos, removes both of you and closes it. You can delete photos you added from the album at any time.</p>

      <h2>Contact</h2>
      <p>samuelkoo0720@gmail.com</p>
    </>
  );
}
