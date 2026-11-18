import type { ReactNode } from "react";
import { serverClient } from "../../lib/supabase/server";
import { isMood } from "../../core/moods";
import { CallDock } from "./chat/call-dock";

// This layout survives client navigation between every /room screen.
export default async function RoomLayout({ children }: { children: ReactNode }) {
  const supabase = await serverClient();
  const auth = supabase ? (await supabase.auth.getUser()).data.user : null;
  const seat = auth && supabase ? (await supabase.from("couple_members").select("room_id").eq("user_id", auth.id).maybeSingle()).data : null;
  const room = seat && supabase ? (await supabase.from("couple_rooms").select("id, mood").eq("id", seat.room_id).maybeSingle()).data : null;
  const count = room && supabase ? (await supabase.from("couple_members").select("user_id", { count: "exact", head: true }).eq("room_id", room.id)).count : 0;
  return <>{children}{auth && room && (count ?? 0) >= 2 && <CallDock key={auth.id + room.id} me={auth.id} roomId={room.id} mood={isMood(room.mood) ? room.mood : "berry"} />}</>;
}
