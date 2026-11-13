import { redirect } from "next/navigation";
import { isMood } from "../../../core/moods";
import type { GuessState } from "../../../core/guess";
import type { DrawState } from "../../../core/draw";
import type { GomokuState } from "../../../core/gomoku";
import { serverClient } from "../../../lib/supabase/server";
import { signOut } from "../actions";
import { RoomTabs } from "../room-tabs";
import { GuessGame } from "./guess-game";
import { DrawGame } from "./draw-game";
import { GomokuGame } from "./gomoku-game";

export const dynamic = "force-dynamic";

export default async function GamePage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const g = (await searchParams).g;
  const which = g === "draw" ? "draw" : g === "gomoku" ? "gomoku" : "guess";
  const supabase = await serverClient();
  if (!supabase) redirect("/login?error=config");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/room/game");
  const { data: seat } = await supabase.from("couple_members").select("room_id").eq("user_id", auth.user.id).maybeSingle();
  if (!seat) redirect("/room");
  const [{ data: room }, { count }, { data: state }, { data: drawState }, { data: gomokuState }] = await Promise.all([
    supabase.from("couple_rooms").select("id, mood").eq("id", seat.room_id).maybeSingle(),
    supabase.from("couple_members").select("user_id", { count: "exact", head: true }).eq("room_id", seat.room_id),
    which === "guess" ? supabase.rpc("guess_state", { target: seat.room_id }) : Promise.resolve({ data: null }),
    which === "draw" ? supabase.rpc("draw_state", { target: seat.room_id }) : Promise.resolve({ data: null }),
    which === "gomoku" ? supabase.rpc("gomoku_state", { target: seat.room_id }) : Promise.resolve({ data: null }),
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
          <>
            <nav className="game-switch" aria-label="게임 고르기">
              <a href="/room/game" aria-current={which === "guess" ? "page" : undefined}>상대 선택 맞히기</a>
              <a href="/room/game?g=draw" aria-current={which === "draw" ? "page" : undefined}>100초 그림 퀴즈</a>
              <a href="/room/game?g=gomoku" aria-current={which === "gomoku" ? "page" : undefined}>오목</a>
            </nav>
            {which === "gomoku" ? (
              <GomokuGame roomId={room.id} initial={(gomokuState as GomokuState | null) ?? { game: null, myWins: 0, partnerWins: 0, draws: 0 }} />
            ) : which === "draw" ? (
              <DrawGame
                roomId={room.id}
                initial={(drawState as DrawState | null) ?? { game: null, nowMs: Date.now(), records: {} }}
              />
            ) : (
              <GuessGame roomId={room.id} initial={(state as GuessState | null) ?? { game: null }} />
            )}
          </>
        ) : (
          <p className="notice">상대가 방에 들어오면 함께 게임할 수 있어요. <a href="/room">초대 링크 만들기</a></p>
        )}
      </div>
    </main>
  );
}
