"use client";

import { createBrowserClient } from "@supabase/ssr";

// Reads the same sign-in cookies the server set. Uses the public key only.
export function browserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}
