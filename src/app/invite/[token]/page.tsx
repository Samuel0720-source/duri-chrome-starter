import { redirect } from "next/navigation";
import { invitePath, isInviteToken } from "../../../core/auth-paths";
import { serverClient } from "../../../lib/supabase/server";
import { getT } from "../../../i18n/server";
import { acceptInvite } from "../../room/actions";

export const dynamic = "force-dynamic";

const errors = { unavailable: "invite.err.unavailable", member: "invite.err.member" } as const;

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const { t } = await getT();
  const errorKey = error && error in errors ? errors[error as keyof typeof errors] : null;
  if (!isInviteToken(token)) {
    return <main className="wrap auth"><p role="alert" className="error">{t("invite.bad")}</p></main>;
  }
  const supabase = await serverClient();
  if (!supabase) return <main className="wrap auth"><p>{t("common.configMissing")}</p></main>;
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=" + encodeURIComponent(invitePath(token)));

  return (
    <main className="wrap auth">
      <section className="sheet">
        <h1>{t("invite.title")}</h1>
        <p>{t("invite.lead")}</p>
        <form action={acceptInvite} className="stack">
          <input type="hidden" name="token" value={token} />
          <button type="submit">{t("invite.join")}</button>
        </form>
        {errorKey && <p role="alert" className="error">{t(errorKey)}</p>}
      </section>
    </main>
  );
}
