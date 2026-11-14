import type { Metadata } from "next";
import { getT } from "../../i18n/server";
import { LegalPage } from "../legal/legal-page";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("legal.terms") + " | " + t("app.name") };
}

export default async function TermsPage() {
  const { t, locale } = await getT();
  return (
    <LegalPage title={t("legal.terms")} updated={locale === "ko" ? "2026년 11월 14일" : "November 14, 2026"}>
      {locale === "ko" ? (
        <>
          <h2>서비스</h2>
          <p>둘이는 두 사람이 함께한 날을 세고, 기념일·대화·게임·함께 보기를 제공하는 무료 개인 프로젝트예요. 기능은 예고 없이 바뀌거나 멈출 수 있어요.</p>
          <h2>계정과 초대 링크</h2>
          <p>초대 링크는 48시간 동안 한 번만 쓸 수 있어요. 링크를 받은 사람은 누구든 방에 들어올 수 있으니 함께할 사람에게만 보내 주세요. 원치 않는 사람이 들어왔다면 바로 ‘방 나가기’로 방을 닫으세요.</p>
          <h2>하지 말아 주세요</h2>
          <p>다른 사람의 계정으로 로그인하기, 서비스를 망가뜨리거나 과도하게 요청하기, 법에 어긋나는 용도로 쓰기, 권리가 없는 영상을 함께 보기에 넣기.</p>
          <h2>책임</h2>
          <p>날짜 계산과 저장이 정확하도록 노력하지만, 서비스는 있는 그대로 제공돼요. 중요한 날짜는 따로도 기록해 두세요.</p>
          <h2>그만 쓰기</h2>
          <p>언제든 설정의 ‘계정 삭제’로 그만 쓸 수 있어요. 지우는 정보는 <a href="/privacy">개인정보처리방침</a>에 적어 두었어요.</p>
          <h2>문의</h2>
          <p>samuelkoo0720@gmail.com</p>
        </>
      ) : (
        <>
          <h2>The service</h2>
          <p>Duri is a free personal project that counts the days two people spend together and offers anniversaries, chat, games and watching videos together. Features may change or stop without notice.</p>
          <h2>Accounts and invite links</h2>
          <p>An invite link works once within 48 hours. Anyone with the link can join the room, so send it only to your partner. If someone unwanted joins, close the room at once with "Leave the room".</p>
          <h2>Please don't</h2>
          <p>Sign in with someone else's account, break the service or flood it with requests, use it for anything illegal, or play videos in Watch together that you have no right to share.</p>
          <h2>Responsibility</h2>
          <p>We work to keep date counting and storage accurate, but the service is provided as is. Keep a separate note of important dates.</p>
          <h2>Stopping</h2>
          <p>You can stop at any time with "Delete account" in Settings. What gets deleted is listed in the <a href="/privacy">privacy policy</a>.</p>
          <h2>Contact</h2>
          <p>samuelkoo0720@gmail.com</p>
        </>
      )}
    </LegalPage>
  );
}
