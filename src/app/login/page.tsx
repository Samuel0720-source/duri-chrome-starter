import { LegalLinks } from "../legal/legal-page";
import { redirect } from "next/navigation";
import { isEmail, safeNext } from "../../core/auth-paths";
import { appOrigin, serverClient } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  email: "이메일 주소를 다시 확인해 주세요.",
  send: "링크를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  link: "로그인 링크가 만료되었거나 다른 브라우저에서 열렸어요. 다시 요청해 주세요.",
  config: "로그인 설정이 아직 연결되지 않았어요.",
  google: "Google 로그인을 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
};

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
  return (
    <main className="wrap auth">
      <header className="top">
        <div className="brand">
          <img alt="" width="32" height="32" src="/icons/icon-192.png" />
          둘이
        </div>
      </header>
      <section className="sheet">
        <h1>로그인</h1>
        {sent ? (
          <p role="status">메일함을 확인해 주세요. 받은 링크를 <strong>이 브라우저</strong>에서 열면 로그인돼요.</p>
        ) : (
          <>
          <form action={continueWithGoogle} className="stack">
            <input type="hidden" name="next" value={safeNext(next)} />
            <button type="submit" className="google">Google로 계속하기</button>
          </form>
          <p className="divider"><span>또는 이메일로</span></p>
          <form action={sendLink} className="stack">
            <input type="hidden" name="next" value={safeNext(next)} />
            <label htmlFor="email">이메일</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
            <button type="submit" className="secondary">로그인 링크 받기</button>
          </form>
          </>
        )}
        {deleted && <p role="status" className="notice">계정과 데이터를 모두 지웠어요.</p>}
        {error && errors[error] && <p role="alert" className="error">{errors[error]}</p>}
      </section>
      <LegalLinks />
    </main>
  );
}
