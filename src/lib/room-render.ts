import { cache } from "react";
import { serverClient } from "./supabase/server";

// Server-render-only, request-scoped snapshots. Never use a module-level promise,
// persistent cache, or this snapshot to authorize a later mutation.
export const roomAccess = cache(async () => {
  const supabase = await serverClient();
  // Signature-checked claims, no Auth round trip. Mutations still call getUser() and RLS decides access.
  const sub = supabase ? (await supabase.auth.getClaims()).data?.claims.sub : undefined;
  const auth = { user: sub ? { id: sub } : null } as const;
  const seat = supabase && auth.user
    ? (await supabase.from("couple_members").select("room_id").eq("user_id", auth.user.id).maybeSingle()).data
    : null;
  return { supabase, auth, seat };
});

export const roomDetails = cache(async () => {
  const { supabase, seat } = await roomAccess();
  return supabase && seat
    ? (await supabase.from("couple_rooms").select("id, start_date, timezone, mood, wallpaper").eq("id", seat.room_id).maybeSingle()).data
    : null;
});

export const roomMemberCount = cache(async () => {
  const { supabase, seat } = await roomAccess();
  return supabase && seat
    ? (await supabase.from("couple_members").select("user_id", { count: "exact", head: true }).eq("room_id", seat.room_id)).count
    : 0;
});
