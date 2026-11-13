import { redirect } from "next/navigation";
import { isMood } from "../../../core/moods";
import { serverClient } from "../../../lib/supabase/server";
import { signOut } from "../actions";
import { RoomTabs } from "../room-tabs";
import { WatchTogether } from "./watch-together";

export const dynamic = "force-dynamic";

export default async function WatchPage() {
  const supabase = await serverClient();
  if (!supabase) redirect("/login?error=config");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/room/watch");
  const { data: seat } = await supabase.from("couple_members").select("room_id").eq("user_id", auth.user.id).maybeSingle();
  if (!seat) redirect("/room");
  const [{ data: room }, { count }] = await Promise.all([
    supabase.from("couple_rooms").select("id, mood").eq("id", seat.room_id).maybeSingle(),
    supabase.from("couple_members").select("user_id", { count: "exact", head: true }).eq("room_id", seat.room_id),
  ]);
  if (!room) redirect("/room");

  return (
    <main className="wrap room-wrap">
      <header className="top">
        <a className="brand" href="/room">
          <img alt="" width="32" height="32" src="/icons/icon-192.png" />
          둘이
        </a>
        <form action={signOut}>
          <button type="submit" className="link">로그아웃</button>
        </form>
      </header>
      <div className="room" data-mood={isMood(room.mood) ? room.mood : "berry"}>
        <RoomTabs active="watch" />
        <h1 className="visually-hidden">함께 보기</h1>
        <WatchTogether roomId={room.id} hasPartner={(count ?? 0) >= 2} />
      </div>
    </main>
  );
}
