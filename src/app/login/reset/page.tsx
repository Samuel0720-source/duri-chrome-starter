import { redirect } from "next/navigation";
import { PASSWORD_MIN } from "../../../core/auth-paths";
import { getT } from "../../../i18n/server";
import { serverClient } from "../../../lib/supabase/server";
import { setNewPassword } from "../actions";
import { AuthShell, errorKeyOf } from "../auth-ui";
import { PasswordField } from "../password-field";

export const dynamic = "force-dynamic";

// The reset email's link lands here already signed in; the person chooses a new password.
export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { error } = await searchParams;
  const { t } = await getT();
  const supabase = await serverClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (!user) redirect("/login/forgot?error=link");
  const errorKey = errorKeyOf(error);
  return (
    <AuthShell back="/login/reset" title={t("reset.title")} lead={t("reset.lead")}>
      <form action={setNewPassword} className="auth-form">
        <PasswordField id="password" name="password" label={t("reset.new")} autoComplete="new-password" minLength={PASSWORD_MIN} />
        <PasswordField id="again" name="again" label={t("signup.again")} autoComplete="new-password" minLength={PASSWORD_MIN} />
        <p className="hint">{t("signup.rule", { n: String(PASSWORD_MIN) })}</p>
        {errorKey && <p role="alert" className="error">{t(errorKey)}</p>}
        <button type="submit" className="auth-primary">{t("reset.submit")}</button>
      </form>
    </AuthShell>
  );
}
