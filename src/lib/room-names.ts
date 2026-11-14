import type { SupabaseClient } from "@supabase/supabase-js";

// Nicknames from member_prefs: what I call my partner (shown on my screen instead of "Partner")
// and what my partner calls me (shown on the settings page). Row level security returns only my room.
export async function roomNames(supabase: SupabaseClient, roomId: string, me: string) {
  const { data } = await supabase.from("member_prefs").select("user_id, partner_nickname").eq("room_id", roomId);
  const mine = (data ?? []).find((r) => r.user_id === me);
  const theirs = (data ?? []).find((r) => r.user_id !== me);
  return { partnerNick: (mine?.partner_nickname as string | null) ?? null, myNick: (theirs?.partner_nickname as string | null) ?? null };
}
