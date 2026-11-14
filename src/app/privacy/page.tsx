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
    <LegalPage title={t("legal.privacy")} updated={locale === "ko" ? "2026년 11월 14일" : "November 14, 2026"}>
      {locale === "ko" ? <Ko /> : <En />}
    </LegalPage>
  );
}

function Ko() {
  return (
    <>
      <h2>모으는 정보</h2>
      <ul>
        <li><strong>로그인 정보:</strong> Google로 로그인하면 Google 계정의 이메일 주소, 이름, 프로필 사진 주소를 받아요. 이메일 링크로 로그인하면 이메일 주소만 받아요.</li>
        <li><strong>커플방 정보:</strong> 함께한 첫날, 기준 시간대, 방 테마, 방에 누가 들어와 있는지, 초대 링크의 만료 시각과 사용 여부. 초대 링크 자체는 저장하지 않고 되돌릴 수 없게 바꾼 값만 저장해요.</li>
        <li><strong>두 사람이 만든 것:</strong> 약속, 대화 메시지, 서로 정한 애칭, 대화를 어디까지 읽었는지와 그 시각, 게임 답과 기록, 함께 보기에 넣은 영상 링크와 재생 위치.</li>
        <li><strong>알림:</strong> 상대가 방을 나갔을 때 보여 줄 안내 한 줄.</li>
        <li><strong>쿠키:</strong> 로그인 상태를 기억하는 쿠키와, 고른 언어를 기억하는 쿠키만 써요. 광고나 방문 분석용 쿠키는 쓰지 않아요.</li>
      </ul>
      <p>로그인하지 않고 첫 화면에서 날짜를 바꿔 보는 미리보기는 서버에 저장되지 않아요. Chrome 확장 프로그램에서 ‘이 기기에 기억’을 켜면 날짜와 시간대가 그 컴퓨터의 Chrome 안에만 저장돼요.</p>

      <h2>쓰는 곳</h2>
      <p>로그인, 두 사람의 방 연결, 기념일 계산, 대화와 게임, 함께 보기, 그리고 상대 화면을 바로 바꾸는 데만 써요. 정보를 팔거나 광고에 쓰지 않아요.</p>

      <h2>맡기는 곳</h2>
      <ul>
        <li><strong>Supabase</strong> (미국 동부): 로그인과 데이터베이스</li>
        <li><strong>Vercel</strong>: 웹사이트 호스팅</li>
        <li><strong>Google</strong>: Google 로그인</li>
        <li><strong>YouTube, Vimeo, 또는 영상 파일이 있는 사이트</strong>: 함께 보기에서 영상을 틀면 두 사람의 브라우저가 그 사이트에 직접 접속해요. 그 사이트는 접속한 기기의 IP 주소 같은 정보를 볼 수 있어요.</li>
      </ul>

      <h2>보는 사람</h2>
      <p>방의 모든 내용은 그 방의 두 사람만 볼 수 있어요. 데이터베이스 규칙이 다른 사람의 접근을 막아요.</p>

      <h2>지우기</h2>
      <p>로그인한 뒤 <strong>설정 → 계정 → 계정 삭제</strong>를 누르면 계정, 로그인 정보, 방, 초대, 알림, 애칭과 읽음 정보가 바로 지워져요. 방에 상대가 있었다면 상대에게는 ‘상대가 방을 나갔어요’만 보여요. ‘방 나가기’만 하면 두 사람 모두 방에서 빠지고 방은 닫혀요.</p>

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
        <li><strong>Sign-in:</strong> with Google, the email address, name and profile picture address of your Google account. With an email link, only the email address.</li>
        <li><strong>Your room:</strong> your first day, time zone, room theme, who is in the room, and when an invite link expires and whether it was used. The invite link itself is not stored, only a value that cannot be turned back into it.</li>
        <li><strong>What the two of you make:</strong> plans, chat messages, the nicknames you set for each other, how far each of you has read the chat and when, game answers and records, and the video links and playback position used in Watch together.</li>
        <li><strong>Notices:</strong> one line telling you when your partner left the room.</li>
        <li><strong>Cookies:</strong> only one that keeps you signed in and one that remembers your language. No advertising or analytics cookies.</li>
      </ul>
      <p>The preview on the home page (trying dates without signing in) is not saved on the server. In the Chrome extension, "remember on this device" keeps the date and time zone only in that computer's Chrome.</p>

      <h2>How we use it</h2>
      <p>Only to sign you in, connect the two of you, count anniversaries, run chat, games and Watch together, and update your partner's screen right away. We never sell it or use it for advertising.</p>

      <h2>Who we rely on</h2>
      <ul>
        <li><strong>Supabase</strong> (US East): sign-in and the database</li>
        <li><strong>Vercel</strong>: website hosting</li>
        <li><strong>Google</strong>: Google sign-in</li>
        <li><strong>YouTube, Vimeo, or the site hosting a video file</strong>: when a video plays in Watch together, both browsers connect to that site directly, and that site can see information such as the device's IP address.</li>
      </ul>

      <h2>Who can see it</h2>
      <p>Everything in a room is visible only to the two people in it. Database rules block everyone else.</p>

      <h2>Deleting</h2>
      <p>After signing in, <strong>Settings → Account → Delete account</strong> deletes your account, sign-in, room, invites, notices, nicknames and read positions at once. If your partner was in the room, they only see "Your partner left". Leaving the room removes both of you and closes it.</p>

      <h2>Contact</h2>
      <p>samuelkoo0720@gmail.com</p>
    </>
  );
}
