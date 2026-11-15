import { STUN_ONLY, cloudflareIce } from "../../../../core/ice";
import { serverClient } from "../../../../lib/supabase/server";

// Fresh call servers for a signed-in member of a two-person room (nobody else may spend relay traffic).
// With CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN set (server-only), Cloudflare issues relay
// credentials that expire in an hour. Without them, or if Cloudflare fails, the call falls back to STUN.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await serverClient();
  if (!supabase) return new Response(null, { status: 503 });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response(null, { status: 401 });
  const { data: seat } = await supabase.from("couple_members").select("room_id").eq("user_id", auth.user.id).maybeSingle();
  if (!seat) return new Response(null, { status: 403 });
  const { count } = await supabase.from("couple_members").select("user_id", { count: "exact", head: true }).eq("room_id", seat.room_id);
  if (count !== 2) return new Response(null, { status: 403 });

  const headers = { "Cache-Control": "no-store" };
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  // Logs say why a call fell back to STUN (never the key or token themselves).
  if (!keyId || !token) {
    console.warn("[call/ice] TURN not configured:", !keyId ? "CLOUDFLARE_TURN_KEY_ID missing" : "CLOUDFLARE_TURN_API_TOKEN missing");
    return Response.json({ iceServers: STUN_ONLY, relay: false }, { headers });
  }
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(keyId)) {
    console.warn("[call/ice] CLOUDFLARE_TURN_KEY_ID has an unexpected shape (length " + keyId.length + ")");
    return Response.json({ iceServers: STUN_ONLY, relay: false }, { headers });
  }
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 3600 }),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) console.warn("[call/ice] Cloudflare answered HTTP " + res.status);
    const servers = res.ok ? cloudflareIce(await res.json()) : null;
    if (servers) return Response.json({ iceServers: servers, relay: true }, { headers });
    if (res.ok) console.warn("[call/ice] Cloudflare answer had no usable TURN entry");
  } catch (e) {
    console.warn("[call/ice] Cloudflare request failed:", e instanceof Error ? e.name : "error");
  }
  return Response.json({ iceServers: STUN_ONLY, relay: false }, { headers });
}
