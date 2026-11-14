import { getT } from "../../../i18n/server";
import { sendPasswordReset } from "../actions";
import { AuthShell, errorKeyOf } from "../auth-ui";

export const dynamic = "force-dynamic";

// Forgotten password: we email a link that lets this browser choose a new one at /login/reset.
// Also the way for people who used to sign in with an email link to set a first password.
export default async function ForgotPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { error, sent } = await searchParams;
  const { t } = await getT();
  const errorKey = errorKeyOf(error);
  return (
    <AuthShell back="/login/forgot" title={t("forgot.title")} lead={t("forgot.lead")}>
      {sent ? (
        <p role="status" className="notice">{t("forgot.sent")}</p>
      ) : (
        <form action={sendPasswordReset} className="auth-form">
          <div className="auth-field">
            <label htmlFor="email">{t("login.email")}</label>
            <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
          </div>
          {errorKey && <p role="alert" className="error">{t(errorKey)}</p>}
          <button type="submit" className="auth-primary">{t("forgot.submit")}</button>
        </form>
      )}
      <p className="auth-switch"><a href="/login">{t("forgot.back")}</a></p>
    </AuthShell>
  );
}
