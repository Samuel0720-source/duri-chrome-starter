import type { ReactNode } from "react";
import { FcGoogle } from "react-icons/fc";
import { getT } from "../../i18n/server";
import type { MessageKey } from "../../i18n/dict";
import { LegalLinks } from "../legal/legal-page";
import { LangSwitch } from "../lang-switch";
import { continueWithGoogle } from "./actions";

// Error codes in the address (?error=wrong) -> sentences. Unknown codes show nothing.
const errorKeys: Record<string, MessageKey> = {
  email: "login.err.email",
  wrong: "login.err.wrong",
  unconfirmed: "login.err.unconfirmed",
  rate: "login.err.rate",
  weak: "login.err.weak",
  try: "login.err.try",
  short: "login.err.short",
  long: "login.err.long",
  mismatch: "login.err.mismatch",
  link: "login.err.link",
  google: "login.err.google",
  config: "common.configMissing",
};
export const errorKeyOf = (code: string | undefined) => (code && Object.hasOwn(errorKeys, code) ? errorKeys[code] : null);

// The frame every sign-in screen shares: brand and language at the top, a big title, then the form.
export async function AuthShell({ back, title, lead, children }: { back: string; title: string; lead: string; children: ReactNode }) {
  const { t } = await getT();
  return (
    <main className="wrap auth auth-page">
      <header className="top">
        <a className="brand" href="/">
          <img alt="" width="61" height="41" src="/icons/postbirds.webp" />
          {t("app.name")}
        </a>
        <LangSwitch back={back} />
      </header>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-art"><img src="/art/post-garden.webp" width="1080" height="720" alt="" /></div>
        <h1 id="auth-title" className="auth-title">{title}</h1>
        <p className="auth-lead">{lead}</p>
        {children}
      </section>
      <LegalLinks />
    </main>
  );
}

// Google's sign-in button: the brand's blue with the multicolour "G" on a white tile, as Google's guidelines ask.
export async function GoogleButton({ next }: { next: string }) {
  const { t } = await getT();
  return (
    <form action={continueWithGoogle} data-mini-handoff>
      <input type="hidden" name="next" value={next} />
      <button type="submit" className="provider provider-google">
        <span className="provider-mark" aria-hidden="true"><FcGoogle /></span>
        <span>{t("login.google")}</span>
      </button>
    </form>
  );
}

export async function Divider() {
  const { t } = await getT();
  return <p className="auth-or"><span>{t("login.or")}</span></p>;
}
