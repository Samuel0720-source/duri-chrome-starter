import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "../../../core/auth-paths";
import { serverClient } from "../../../lib/supabase/server";

// The email link lands here with a one-time code. Exchanging it sets the sign-in cookie.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const supabase = await serverClient();
  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }
  return NextResponse.redirect(new URL("/login?error=link&next=" + encodeURIComponent(next), request.url));
}
