import type { Metadata } from "next";
import { LegalPage } from "../legal/legal-page";

export const metadata: Metadata = { title: "개인정보처리방침 | 둘이" };

export default function PrivacyPage() {
  return (
    <LegalPage title="개인정보처리방침" updated="2026년 11월 11일">
      <h2>모으는 정보</h2>
      <ul>
        <li><strong>로그인 정보:</strong> Google로 로그인하면 Google 계정의 이메일 주소, 이름, 프로필 사진 주소를 받아요. 이메일 링크로 로그인하면 이메일 주소만 받아요.</li>
        <li><strong>커플방 정보:</strong> 함께한 첫날, 기준 시간대, 방에 누가 들어와 있는지, 초대 링크의 만료 시각과 사용 여부. 초대 링크 자체는 저장하지 않고 되돌릴 수 없게 바꾼 값만 저장해요.</li>
        <li><strong>알림:</strong> 상대가 방을 나갔을 때 보여 줄 안내 한 줄.</li>
        <li><strong>로그인 유지용 쿠키:</strong> 로그인 상태를 기억하는 쿠키만 써요. 광고나 방문 분석용 쿠키는 쓰지 않아요.</li>
      </ul>
      <p>로그인하지 않고 첫 화면에서 날짜를 바꿔 보는 미리보기는 서버에 저장되지 않아요. Chrome 확장 프로그램에서 ‘이 기기에 기억’을 켜면 날짜와 시간대가 그 컴퓨터의 Chrome 안에만 저장돼요.</p>

      <h2>쓰는 곳</h2>
      <p>로그인, 두 사람의 방 연결, 기념일 계산, 상대가 들어오거나 나갈 때 화면을 바로 바꾸는 데만 써요. 정보를 팔거나 광고에 쓰지 않아요.</p>

      <h2>맡기는 곳</h2>
      <ul>
        <li><strong>Supabase</strong> (미국 동부): 로그인과 데이터베이스</li>
        <li><strong>Vercel</strong>: 웹사이트 호스팅</li>
        <li><strong>Google</strong>: Google 로그인</li>
      </ul>

      <h2>보는 사람</h2>
      <p>방의 날짜와 멤버 정보는 그 방의 두 사람만 볼 수 있어요. 데이터베이스 규칙이 다른 사람의 접근을 막아요.</p>

      <h2>지우기</h2>
      <p>로그인한 뒤 ‘우리 방’ 화면 아래의 <strong>계정 삭제</strong>를 누르면 계정, 로그인 정보, 방, 초대, 알림이 바로 지워져요. 방에 상대가 있었다면 상대에게는 ‘상대가 방을 나갔어요’만 보여요. ‘방 나가기’만 하면 두 사람 모두 방에서 빠지고 방은 닫혀요. 닫힌 방에는 첫날과 시간대만 남고, 누구의 방이었는지는 남지 않아요.</p>

      <h2>문의</h2>
      <p>samuelkoo0720@gmail.com</p>
    </LegalPage>
  );
}
