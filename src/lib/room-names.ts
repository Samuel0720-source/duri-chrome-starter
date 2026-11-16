import type { SupabaseClient } from "@supabase/supabase-js";
import { type Birthday, isMonthDay } from "../core/dates";

// From member_prefs: what I call my partner (shown on my screen instead of "Partner"), what my partner
// calls me (shown on the settings page), and each person's birthday ('MM-DD', no year).
// Row level security returns only my room.
export async function roomNames(supabase: SupabaseClient, roomId: string, me: string) {
  const { data } = await supabase.from("member_prefs").select("user_id, partner_nickname, birthday").eq("room_id", roomId);
  const mine = (data ?? []).find((r) => r.user_id === me);
  const theirs = (data ?? []).find((r) => r.user_id !== me);
  const day = (v: unknown) => (typeof v === "string" && isMonthDay(v) ? v : null);
  return {
    partnerNick: (mine?.partner_nickname as string | null) ?? null,
    myNick: (theirs?.partner_nickname as string | null) ?? null,
    myBirthday: day(mine?.birthday),
    partnerBirthday: day(theirs?.birthday),
  };
}

// Both birthdays, ready for upcomingMilestones; the partner's carries the nickname I chose.
export function birthdaysOf(names: Awaited<ReturnType<typeof roomNames>>): Birthday[] {
  const list: Birthday[] = [];
  if (names.myBirthday) list.push({ who: "me", monthDay: names.myBirthday });
  if (names.partnerBirthday) list.push({ who: "partner", monthDay: names.partnerBirthday, ...(names.partnerNick ? { name: names.partnerNick } : {}) });
  return list;
}
