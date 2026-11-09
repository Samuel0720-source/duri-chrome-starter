import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNext } from "../../../core/auth-paths";
import { serverClient } from "../../../lib/supabase/server";

const otpTypes: EmailOtpType[] = ["magiclink", "email", "signup", "invite"];

// Two ways to land here:
// 1. ?code=…        Google sign-in or a PKCE email link: exchange the one-time code.
// 2. ?token_hash=…  A hashed email token. It works in any browser, because no
//                   browser-stored PKCE verifier is needed. Automated tests use it too.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const next = safeNext(params.get("next"));
  const supabase = await serverClient();
  if (supabase) {
    let ok = false;
    if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
    else if (tokenHash && type && otpTypes.includes(type)) {
      ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
    }
    if (ok) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL("/login?error=link&next=" + encodeURIComponent(next), request.url));
}
