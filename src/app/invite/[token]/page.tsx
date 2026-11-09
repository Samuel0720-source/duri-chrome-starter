import { redirect } from "next/navigation";
import { invitePath, isInviteToken } from "../../../core/auth-paths";
import { serverClient } from "../../../lib/supabase/server";
import { acceptInvite } from "../../room/actions";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  unavailable: "만료되었거나 이미 사용된 초대예요. 상대에게 새 링크를 받아 주세요.",
  member: "이미 다른 방에 들어가 있어요.",
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  if (!isInviteToken(token)) {
    return <main className="wrap auth"><p role="alert" className="error">잘못된 초대 링크예요.</p></main>;
  }
  const supabase = await serverClient();
  if (!supabase) return <main className="wrap auth"><p>로그인 설정이 아직 연결되지 않았어요.</p></main>;
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=" + encodeURIComponent(invitePath(token)));

  return (
    <main className="wrap auth">
      <section className="sheet">
        <h1>초대를 받았어요</h1>
        <p>들어가면 두 사람만 볼 수 있는 방이 열려요.</p>
        <form action={acceptInvite} className="stack">
          <input type="hidden" name="token" value={token} />
          <button type="submit">방에 들어가기</button>
        </form>
        {error && errors[error] && <p role="alert" className="error">{errors[error]}</p>}
      </section>
    </main>
  );
}
