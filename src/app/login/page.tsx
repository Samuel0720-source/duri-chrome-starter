import { LegalLinks } from "../legal/legal-page";
import { redirect } from "next/navigation";
import { isEmail, safeNext } from "../../core/auth-paths";
import { appOrigin, serverClient } from "../../lib/supabase/server";
import { getT } from "../../i18n/server";
import { Rich } from "../../i18n/client";
import { LangSwitch } from "../lang-switch";

export const dynamic = "force-dynamic";

const errors = {
  email: "login.err.email",
  send: "login.err.send",
  link: "login.err.link",
  config: "common.configMissing",
  google: "login.err.google",
} as const;

// Google sign-in sends no email, so it is not limited by the project's email quota.
async function continueWithGoogle(formData: FormData) {
  "use server";
  const next = safeNext(String(formData.get("next") ?? ""));
  const supabase = await serverClient();
  if (!supabase) redirect("/login?error=config");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: appOrigin() + "/auth/callback?next=" + encodeURIComponent(next),
      // Always show the account picker, so two partners can share one device.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?error=google&next=" + encodeURIComponent(next));
  redirect(data.url);
}

async function sendLink(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? ""));
  const back = "&next=" + encodeURIComponent(next);
  if (!isEmail(email)) redirect("/login?error=email" + back);
  const supabase = await serverClient();
  if (!supabase) redirect("/login?error=config" + back);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: appOrigin() + "/auth/callback?next=" + encodeURIComponent(next) },
  });
  redirect(error ? "/login?error=send" + back : "/login?sent=1");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { next, sent, error, deleted } = await searchParams;
  const { t } = await getT();
  const errorKey = error && error in errors ? errors[error as keyof typeof errors] : null;
  // Already signed in on this device: no second sign-in.
  if (!deleted) {
    const supabase = await serverClient();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (user) redirect(safeNext(next));
  }
  return (
    <main className="wrap auth">
      <header className="top">
        <div className="brand">
          <img alt="" width="32" height="32" src="/icons/icon-192.png" />
          {t("app.name")}
        </div>
        <LangSwitch back={"/login" + (next ? "?next=" + encodeURIComponent(safeNext(next)) : "")} />
      </header>
      <section className="sheet">
        <h1>{t("login.title")}</h1>
        {sent ? (
          <p role="status"><Rich text={t("login.sent")} parts={{ b: <strong>{t("login.thisBrowser")}</strong> }} /></p>
        ) : (
          <>
          <form action={continueWithGoogle} className="stack">
            <input type="hidden" name="next" value={safeNext(next)} />
            <button type="submit" className="google">{t("login.google")}</button>
          </form>
          <p className="divider"><span>{t("login.orEmail")}</span></p>
          <form action={sendLink} className="stack">
            <input type="hidden" name="next" value={safeNext(next)} />
            <label htmlFor="email">{t("login.email")}</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
            <button type="submit" className="secondary">{t("login.sendLink")}</button>
          </form>
          </>
        )}
        {deleted && <p role="status" className="notice">{t("login.deleted")}</p>}
        {errorKey && <p role="alert" className="error">{t(errorKey)}</p>}
      </section>
      <LegalLinks />
    </main>
  );
}
