import { HomeLive } from "./preview";
import { InstallControl } from "./install";
import { roomToday } from "../core/dates";
import { defaultZone } from "../core/preview";

export const dynamic = "force-dynamic";

const steps = [
  { title: "Google로 로그인", line: "계정 하나면 돼요. 비밀번호를 따로 만들지 않아요." },
  { title: "방을 만들고 링크 보내기", line: "함께한 첫날을 고르면 초대 링크가 생겨요. 48시간 동안 한 번만 열려요." },
  { title: "같은 숫자를 함께 보기", line: "상대가 들어오면 두 화면이 새로고침 없이 같은 날을 세요." },
];

export default function Home() {
  return (
    <>
      <header className="nav">
        <div className="container nav-row">
          <a className="brand" href="/">
            <img alt="" width="36" height="36" src="/icons/icon-192.png" />
            둘이
          </a>
          <nav className="nav-actions" aria-label="계정">
            <a className="nav-link" href="/room">로그인</a>
            <InstallControl />
          </nav>
        </div>
      </header>
      <main>
        <HomeLive initialToday={roomToday(new Date(), defaultZone)}>
          <h1>우리 기념일</h1>
          <p className="lead">함께한 첫날을 고르면 다음 기념일이 보여요.</p>
          <div className="actions">
            <a className="button" href="/room">둘이 시작하기</a>
          </div>
        </HomeLive>

        <section className="together" aria-labelledby="together-head">
          <div className="container together-grid">
            <div className="together-head">
              <h2 id="together-head">둘이 함께 쓰는 방</h2>
              <p className="lead">두 사람만 들어올 수 있어요.</p>
            </div>
            <ol className="steps">
              {steps.map((s) => (
                <li key={s.title}>
                  <h3>{s.title}</h3>
                  <p>{s.line}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="install-band" aria-labelledby="install-head">
          <div className="container band-row">
            <div>
              <h2 id="install-head">앱처럼 열기</h2>
              <p className="lead">휴대폰 홈 화면이나 컴퓨터에 두고 바로 열어요.</p>
            </div>
            <div className="band-actions">
              <InstallControl />
              <a className="button" href="/room">둘이 시작하기</a>
            </div>
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="container footer-grid">
          <p className="footer-mark">둘이</p>
          <nav className="footer-links" aria-label="바닥글">
            <a href="/room">우리 방</a>
            <a href="/privacy">개인정보처리방침</a>
            <a href="/terms">이용약관</a>
          </nav>
          <p className="footer-line">두 사람이 함께하는 날을 세어요.</p>
        </div>
      </footer>
    </>
  );
}
