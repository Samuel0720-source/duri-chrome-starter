import { HomeLive } from "./preview";
import { InstallControl } from "./install";
import { roomToday } from "../core/dates";
import { defaultZone } from "../core/preview";
import { redirect } from "next/navigation";
import { serverClient } from "../lib/supabase/server";
import { getT } from "../i18n/server";
import { LangSwitch } from "./lang-switch";

export const dynamic = "force-dynamic";

const steps = [1, 2, 3] as const;

// Signed in on this device already? Go straight to the room: the sign-in cookie lasts 400 days
// and is only removed by "로그아웃". The Chrome popup's "전체 웹앱 열기" lands here.
export default async function Home() {
  const supabase = await serverClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (user) redirect("/room");
  const { t } = await getT();
  return (
    <>
      <header className="nav">
        <div className="container nav-row">
          <a className="brand" href="/">
            <img alt="" width="36" height="36" src="/icons/icon-192.png" />
            {t("app.name")}
          </a>
          <nav className="nav-actions" aria-label={t("landing.account")}>
            <LangSwitch back="/" />
            <a className="nav-link" href="/room">{t("landing.signIn")}</a>
            <InstallControl />
          </nav>
        </div>
      </header>
      <main>
        <HomeLive initialToday={roomToday(new Date(), defaultZone)}>
          <img className="landing-birds" src="/icons/postbirds.webp" width="192" height="128" alt="" />
          <h1>{t("landing.title")}</h1>
          <p className="lead">{t("landing.lead")}</p>
          <div className="actions">
            <a className="button" href="/room">{t("landing.start")}</a>
          </div>
        </HomeLive>

        <section className="together" aria-labelledby="together-head">
          <div className="container together-grid">
            <div className="together-head">
              <h2 id="together-head">{t("landing.togetherTitle")}</h2>
              <p className="lead">{t("landing.togetherLead")}</p>
            </div>
            <ol className="steps">
              {steps.map((n) => (
                <li key={n}>
                  <h3>{t(`landing.step${n}.title`)}</h3>
                  <p>{t(`landing.step${n}.line`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="install-band" aria-labelledby="install-head">
          <div className="container band-row">
            <div>
              <h2 id="install-head">{t("landing.installTitle")}</h2>
              <p className="lead">{t("landing.installLead")}</p>
            </div>
            <div className="band-actions">
              <InstallControl />
              <a className="button" href="/room">{t("landing.start")}</a>
            </div>
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="container footer-grid">
          <p className="footer-mark">{t("app.name")}</p>
          <nav className="footer-links" aria-label={t("landing.footer")}>
            <a href="/room">{t("landing.ourRoom")}</a>
            <a href="/privacy">{t("legal.privacy")}</a>
            <a href="/terms">{t("legal.terms")}</a>
          </nav>
          <p className="footer-line">{t("landing.footerLine")}</p>
        </div>
      </footer>
    </>
  );
}
