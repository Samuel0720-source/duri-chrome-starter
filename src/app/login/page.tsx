import { redirect } from "next/navigation";
import { safeNext } from "../../core/auth-paths";
import { getT } from "../../i18n/server";
import { serverClient } from "../../lib/supabase/server";
import { AuthShell, Divider, GoogleButton, errorKeyOf } from "./auth-ui";
import { signInWithPassword } from "./actions";
import { PasswordField } from "./password-field";

export const dynamic = "force-dynamic";

// Sign in: email and password, or Google. New people go to /signup; forgotten passwords to /login/forgot.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { next: rawNext, error, deleted } = await searchParams;
  const next = safeNext(rawNext);
  const { t } = await getT();
  // Already signed in on this device: no second sign-in.
  if (!deleted) {
    const supabase = await serverClient();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (user) redirect(next);
  }
  const errorKey = errorKeyOf(error);
  const q = "?next=" + encodeURIComponent(next);
  return (
    <AuthShell back={"/login" + q} title={t("login.title")} lead={t("login.lead")}>
      {deleted && <p role="status" className="notice">{t("login.deleted")}</p>}
      <form action={signInWithPassword} className="auth-form">
        <input type="hidden" name="next" value={next} />
        <div className="auth-field">
          <label htmlFor="email">{t("login.email")}</label>
          <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
        </div>
        <PasswordField id="password" name="password" label={t("login.password")} autoComplete="current-password" />
        <a className="auth-forgot" href="/login/forgot">{t("login.forgot")}</a>
        {errorKey && <p role="alert" className="error">{t(errorKey)}</p>}
        <button type="submit" className="auth-primary">{t("login.submit")}</button>
      </form>
      <p className="auth-switch">
        {t("login.noAccount")} <a href={"/signup" + q}>{t("login.create")}</a>
      </p>
      <Divider />
      <GoogleButton next={next} />
    </AuthShell>
  );
}
