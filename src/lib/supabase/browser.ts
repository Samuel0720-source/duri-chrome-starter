"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let framedClient: SupabaseClient | undefined;
let cachedToken: { value: string; until: number } | undefined;
let pendingToken: Promise<string | null> | undefined;

async function frameToken(): Promise<string | null> {
  if (cachedToken && cachedToken.until > Date.now()) return cachedToken.value;
  if (pendingToken) return pendingToken;
  pendingToken = (async () => {
    const response = await fetch("/api/session/token", {
      credentials: "same-origin", cache: "no-store",
      headers: { "X-Duri-Surface": "popup" },
    });
    if (!response.ok) { cachedToken = undefined; return null; }
    const body = await response.json();
    if (typeof body.accessToken !== "string" || typeof body.expiresAt !== "number") return null;
    // Memory only; recheck the website's cookies at least every 30 seconds.
    cachedToken = { value: body.accessToken, until: Math.min(Date.now() + 30_000, body.expiresAt * 1000 - 60_000) };
    return body.accessToken as string;
  })().finally(() => { pendingToken = undefined; });
  return pendingToken;
}

// Normal tabs read the site's cookies. Chrome extension frames use authenticated
// same-origin HTTP instead: Chrome hides SameSite cookies from document.cookie.
export function browserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const extensionFrame = typeof window !== "undefined" && window.parent !== window &&
    Array.from(window.location.ancestorOrigins ?? []).some(origin => origin.startsWith("chrome-extension://"));
  if (extensionFrame) {
    framedClient ??= createClient(url, key, { accessToken: frameToken });
    return framedClient;
  }
  return createBrowserClient(url, key);
}
