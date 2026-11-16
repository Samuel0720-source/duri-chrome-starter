import { cache } from "react";
import { serverClient } from "./supabase/server";

// Deduplicates auth + seat + room queries between RoomShell and each room page within a single RSC request.
export const getRoomSession = cache(async () => {
  const supabase = await serverClient();
  if (!supabase) return { supabase: null, user: null, roomId: null };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { supabase, user: null, roomId: null };
  const { data: seat } = await supabase
    .from("couple_members")
    .select("room_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  return {
    supabase,
    user: auth.user,
    roomId: (seat?.room_id as string | undefined) ?? null,
  };
});

export const getRoomSummary = cache(async (roomId: string) => {
  const { supabase } = await getRoomSession();
  if (!supabase) return { room: null, count: 0 };
  const [{ data: room }, { count }] = await Promise.all([
    supabase
      .from("couple_rooms")
      .select("id, start_date, timezone, mood, wallpaper")
      .eq("id", roomId)
      .maybeSingle(),
    supabase
      .from("couple_members")
      .select("user_id", { count: "exact", head: true })
      .eq("room_id", roomId),
  ]);
  return { room, count: count ?? 0 };
});
