"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let framedClient: SupabaseClient | undefined;
// Always consult the current HTTP cookies. A token cache could briefly reuse the
// previous person's session after signing out and signing in as someone else.
async function frameToken(): Promise<string | null> {
  const response = await fetch("/api/session/token", {
    credentials: "same-origin", cache: "no-store",
    headers: { "X-Duri-Surface": "popup" },
  });
  if (!response.ok) return null;
  const body = await response.json();
  return typeof body.accessToken === "string" ? body.accessToken : null;
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
