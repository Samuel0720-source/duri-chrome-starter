import { PokerGame } from "./poker-game";
import { NewGame } from "./new-game";
import type { PokerState } from "../../../core/poker";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PostcardGame } from "./postcard-game";
import type { PostcardState } from "../../../core/postcards";
import { isMood } from "../../../core/moods";
import type { GuessState } from "../../../core/guess";
import type { DrawState } from "../../../core/draw";
import type { GomokuState } from "../../../core/gomoku";
import type { GolfState } from "../../../core/golf";
import type { ChessState } from "../../../core/chess";
import { getT } from "../../../i18n/server";
import { getRoomSession, getRoomSummary } from "../../../lib/room-context";
import { roomNames } from "../../../lib/room-names";
import { RoomTabs } from "../room-tabs";
import { RoomShell } from "../room-shell";
import { GuessGame } from "./guess-game";
import { DrawGame } from "./draw-game";
import { GomokuGame } from "./gomoku-game";
import { GolfGame } from "./golf-game";
import { ChessGame } from "./chess-game";

export const dynamic = "force-dynamic";

export default async function GamePage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const { t } = await getT();
  const g = (await searchParams).g;
  const which = g === "draw" || g === "gomoku" || g === "chess" || g === "golf" || g === "post" || g === "poker" ? g : "guess";
  const { supabase, user, roomId } = await getRoomSession();
  if (!supabase) redirect("/login?error=config");
  if (!user) redirect("/login?next=/room/game");
  if (!roomId) redirect("/room");
  const [summary, { data: state }, { data: drawState }, { data: gomokuState }, { data: chessState }, { data: golfState }, { data: postState }, { data: pokerState }, names] = await Promise.all([
    getRoomSummary(roomId),
    which === "guess" ? supabase.rpc("guess_state", { target: roomId }) : Promise.resolve({ data: null }),
    which === "draw" ? supabase.rpc("draw_state", { target: roomId }) : Promise.resolve({ data: null }),
    which === "gomoku" ? supabase.rpc("gomoku_state", { target: roomId }) : Promise.resolve({ data: null }),
    which === "chess" ? supabase.rpc("chess_state", { target: roomId }) : Promise.resolve({ data: null }),
    which === "golf" ? supabase.rpc("golf_state", { target: roomId }) : Promise.resolve({ data: null }),
    which === "post" ? supabase.rpc("postcard_state", { target: roomId }) : Promise.resolve({ data: null }),
    which === "poker" ? supabase.rpc("poker_state", { target: roomId }) : Promise.resolve({ data: null }),
    roomNames(supabase, roomId, user.id),
  ]);
  const { room, count } = summary;
  if (!room) redirect("/room");
  const full = count >= 2;
  const partnerName = names.partnerNick ?? t("common.partner");
  const games = [
    ["guess", "/room/game"],
    ["draw", "/room/game?g=draw"],
    ["gomoku", "/room/game?g=gomoku"],
    ["chess", "/room/game?g=chess"],
    ["golf", "/room/game?g=golf"],
    ["post", "/room/game?g=post"],
    ["poker", "/room/game?g=poker"],
  ] as const;

  return (
    <RoomShell>
      <div className="room" data-mood={isMood(room.mood) ? room.mood : "berry"}>
        <RoomTabs active="game" />
        <h1 className="visually-hidden">{t("game.title")}</h1>
        {full ? (
          <>
            <nav className="game-switch" aria-label={t("game.pick")}>
              {games.map(([key, href]) => (
                <Link key={key} href={href} aria-current={which === key ? "page" : undefined}>{t(`game.${key}`)}</Link>
              ))}
            </nav>
            <NewGame key={which} roomId={room.id} kind={which} partnerName={partnerName} />
            {which === "poker" ? (
              <PokerGame roomId={room.id} initial={pokerState as PokerState | null} partnerName={partnerName} myName={names.myNick ?? t("common.me")} />
            ) : which === "post" ? (
              <PostcardGame key={room.id} roomId={room.id} partnerName={partnerName} initial={postState as PostcardState | null} />
            ) : which === "golf" ? (
              <GolfGame roomId={room.id} partnerName={partnerName} initial={(golfState as GolfState | null) ?? { game: null, best: {}, nowMs: Date.now() }} />
            ) : which === "chess" ? (
              <ChessGame roomId={room.id} partnerName={partnerName} initial={(chessState as ChessState | null) ?? { game: null, myWins: 0, partnerWins: 0, draws: 0 }} />
            ) : which === "gomoku" ? (
              <GomokuGame roomId={room.id} partnerName={partnerName} initial={(gomokuState as GomokuState | null) ?? { game: null, myWins: 0, partnerWins: 0, draws: 0 }} />
            ) : which === "draw" ? (
              <DrawGame roomId={room.id} partnerName={partnerName} initial={(drawState as DrawState | null) ?? { game: null, nowMs: Date.now(), records: {} }} />
            ) : (
              <GuessGame roomId={room.id} partnerName={partnerName} initial={(state as GuessState | null) ?? { game: null }} />
            )}
          </>
        ) : (
          <p className="notice">{t("game.needPartner")} <Link href="/room">{t("chat.inviteLink")}</Link></p>
        )}
      </div>
    </RoomShell>
  );
}
