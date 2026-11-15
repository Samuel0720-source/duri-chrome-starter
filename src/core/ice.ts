// Which servers help two browsers find each other for a call.
//  * STUN only tells a browser its public address. That is enough on many home Wi-Fi networks, but not
//    when either side is behind a strict NAT (mobile data, campus Wi-Fi): then the call "connects" nowhere.
//  * TURN relays the audio and video when no direct path exists. Its credentials expire, so the server
//    asks for fresh ones per call and keeps the secret key to itself.

export type IceServer = { urls: string | string[]; username?: string; credential?: string };

export const STUN_ONLY: IceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }];

// Cloudflare returns one { urls, username, credential } entry. Browsers block port 53, so drop those URLs.
export function cloudflareIce(body: unknown): IceServer[] | null {
  const entry = (body as { iceServers?: unknown } | null)?.iceServers;
  const list = Array.isArray(entry) ? entry : entry ? [entry] : [];
  const out: IceServer[] = [];
  for (const raw of list) {
    const s = raw as Partial<IceServer>;
    const urls = (Array.isArray(s.urls) ? s.urls : typeof s.urls === "string" ? [s.urls] : [])
      .filter((u): u is string => typeof u === "string" && /^(stun|turns?):/.test(u) && !/:53(\?|$)/.test(u));
    if (urls.length === 0) continue;
    out.push(typeof s.username === "string" && typeof s.credential === "string"
      ? { urls, username: s.username, credential: s.credential }
      : { urls });
  }
  return out.some((s) => s.username) ? out : null;
}

// What the call page receives: a list it can hand straight to RTCPeerConnection.
export function isIceList(value: unknown): value is IceServer[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 8 && value.every((s) => {
    const urls = (s as IceServer)?.urls;
    return typeof urls === "string" || (Array.isArray(urls) && urls.every((u) => typeof u === "string"));
  });
}

// The route a connected call took, from the selected candidate pair's local candidate type.
export const routeOf = (candidateType: string | undefined) => (candidateType === "relay" ? "relay" : "direct");
