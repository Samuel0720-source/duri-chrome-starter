import { redirect } from "next/navigation";
import { PASSWORD_MIN, safeNext } from "../../core/auth-paths";
import { getT } from "../../i18n/server";
import { serverClient } from "../../lib/supabase/server";
import { signUpWithPassword } from "../login/actions";
import { AuthShell, Divider, GoogleButton, errorKeyOf } from "../login/auth-ui";
import { PasswordField } from "../login/password-field";

export const dynamic = "force-dynamic";

// Create an account with email and password. Supabase emails a confirmation link before the first sign-in.
export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { next: rawNext, error, sent } = await searchParams;
  const next = safeNext(rawNext);
  const { t } = await getT();
  const supabase = await serverClient();
  if (supabase && (await supabase.auth.getUser()).data.user) redirect(next);
  const errorKey = errorKeyOf(error);
  const q = "?next=" + encodeURIComponent(next);
  return (
    <AuthShell back={"/signup" + q} title={t("signup.title")} lead={t("signup.lead")}>
      {sent ? (
        <p role="status" className="notice">{t("signup.sent")}</p>
      ) : (
        <>
          <form action={signUpWithPassword} className="auth-form">
            <input type="hidden" name="next" value={next} />
            <div className="auth-field">
              <label htmlFor="email">{t("login.email")}</label>
              <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
            </div>
            <PasswordField id="password" name="password" label={t("login.password")} autoComplete="new-password" minLength={PASSWORD_MIN} />
            <PasswordField id="again" name="again" label={t("signup.again")} autoComplete="new-password" minLength={PASSWORD_MIN} />
            <p className="hint">{t("signup.rule", { n: String(PASSWORD_MIN) })}</p>
            {errorKey && <p role="alert" className="error">{t(errorKey)}</p>}
            <button type="submit" className="auth-primary">{t("signup.submit")}</button>
          </form>
          <Divider />
          <GoogleButton next={next} />
        </>
      )}
      <p className="auth-switch">
        {t("signup.haveAccount")} <a href={"/login" + q}>{t("login.submit")}</a>
      </p>
    </AuthShell>
  );
}
