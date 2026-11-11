import { redirect } from "next/navigation";
import { isMood } from "../../../core/moods";
import { serverClient } from "../../../lib/supabase/server";
import { signOut } from "../actions";
import { RoomTabs } from "../room-tabs";
import { Chat, type Message } from "./chat";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const supabase = await serverClient();
  if (!supabase) redirect("/login?error=config");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/room/chat");
  const { data: seat } = await supabase.from("couple_members").select("room_id").eq("user_id", auth.user.id).maybeSingle();
  if (!seat) redirect("/room");
  const [{ data: room }, { count }, { data: recent }] = await Promise.all([
    supabase.from("couple_rooms").select("id, timezone, mood").eq("id", seat.room_id).maybeSingle(),
    supabase.from("couple_members").select("user_id", { count: "exact", head: true }).eq("room_id", seat.room_id),
    supabase.from("room_messages").select("id, sender, body, created_at").eq("room_id", seat.room_id).order("id", { ascending: false }).limit(50),
  ]);
  if (!room) redirect("/room");
  const full = (count ?? 0) >= 2;
  const initial: Message[] = (recent ?? []).reverse();

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
        <RoomTabs active="chat" />
        <section className="chat-wrap" aria-labelledby="chat-head">
          <h1 id="chat-head" className="visually-hidden">대화</h1>
          {full ? (
            <Chat roomId={room.id} me={auth.user.id} zone={room.timezone} initial={initial} />
          ) : (
            <p className="notice">상대가 방에 들어오면 대화할 수 있어요. <a href="/room">초대 링크 만들기</a></p>
          )}
        </section>
      </div>
    </main>
  );
}
