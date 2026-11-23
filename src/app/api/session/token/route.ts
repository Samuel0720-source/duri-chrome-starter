import { serverClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vary": "Cookie",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
};

// Chrome can send the site's cookies from an extension frame while hiding them from
// document.cookie. Only the site's own JS may ask for its existing, validated access
// token. Never return refresh tokens or pass credentials through the extension bridge.
export async function GET(request: Request) {
  if (request.headers.get("sec-fetch-site") !== "same-origin" || request.headers.get("x-duri-surface") !== "popup") {
    return new Response(null, { status: 403, headers });
  }
  const supabase = await serverClient();
  if (!supabase) return new Response(null, { status: 503, headers });
  const { data: verified, error } = await supabase.auth.getClaims();
  if (error || !verified) return new Response(null, { status: 401, headers });
  const { data } = await supabase.auth.getSession();
  if (!data.session || data.session.user.id !== verified.claims.sub) return new Response(null, { status: 401, headers });
  return Response.json({ accessToken: data.session.access_token, expiresAt: data.session.expires_at }, { headers });
}
