import { redirect } from "next/navigation";
import { isMood } from "../../../core/moods";
import type { GuessState } from "../../../core/guess";
import { serverClient } from "../../../lib/supabase/server";
import { signOut } from "../actions";
import { RoomTabs } from "../room-tabs";
import { GuessGame } from "./guess-game";

export const dynamic = "force-dynamic";

export default async function GamePage() {
  const supabase = await serverClient();
  if (!supabase) redirect("/login?error=config");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/room/game");
  const { data: seat } = await supabase.from("couple_members").select("room_id").eq("user_id", auth.user.id).maybeSingle();
  if (!seat) redirect("/room");
  const [{ data: room }, { count }, { data: state }] = await Promise.all([
    supabase.from("couple_rooms").select("id, mood").eq("id", seat.room_id).maybeSingle(),
    supabase.from("couple_members").select("user_id", { count: "exact", head: true }).eq("room_id", seat.room_id),
    supabase.rpc("guess_state", { target: seat.room_id }),
  ]);
  if (!room) redirect("/room");
  const full = (count ?? 0) >= 2;

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
        <RoomTabs active="game" />
        <h1 className="visually-hidden">게임</h1>
        {full ? (
          <GuessGame roomId={room.id} initial={(state as GuessState | null) ?? { game: null }} />
        ) : (
          <p className="notice">상대가 방에 들어오면 함께 게임할 수 있어요. <a href="/room">초대 링크 만들기</a></p>
        )}
      </div>
    </main>
  );
}
