import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the sign-in cookie before signed-in pages render. It does not decide access;
// pages check the user and the database checks room membership.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) response.cookies.set(name, value, options);
      },
    },
  });
  const started = performance.now();
  // Refreshes an expired session; otherwise checks the token's signature locally (ECC key), no Auth round trip.
  await supabase.auth.getClaims();
  // Visible in the browser's network panel: how long the sign-in refresh took before the page started.
  response.headers.set("Server-Timing", `auth;desc="sign-in refresh";dur=${(performance.now() - started).toFixed(1)}`);
  return response;
}

export const config = { matcher: ["/", "/room/:path*", "/invite/:path*", "/login"] };
