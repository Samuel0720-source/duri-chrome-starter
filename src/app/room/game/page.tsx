import { redirect } from "next/navigation";
import { PostcardGame } from "./postcard-game";
import { roomToday } from "../../../core/dates";
import { isMood } from "../../../core/moods";
import type { GuessState } from "../../../core/guess";
import type { DrawState } from "../../../core/draw";
import type { GomokuState } from "../../../core/gomoku";
import type { GolfState } from "../../../core/golf";
import { getT } from "../../../i18n/server";
import { serverClient } from "../../../lib/supabase/server";
import { roomNames } from "../../../lib/room-names";
import { RoomTabs } from "../room-tabs";
import { RoomShell } from "../room-shell";
import { GuessGame } from "./guess-game";
import { DrawGame } from "./draw-game";
import { GomokuGame } from "./gomoku-game";
import { GolfGame } from "./golf-game";

export const dynamic = "force-dynamic";

export default async function GamePage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const { t } = await getT();
  const g = (await searchParams).g;
  const which = g === "draw" || g === "gomoku" || g === "golf" || g === "post" ? g : "guess";
  const supabase = await serverClient();
  if (!supabase) redirect("/login?error=config");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/room/game");
  const { data: seat } = await supabase.from("couple_members").select("room_id").eq("user_id", auth.user.id).maybeSingle();
  if (!seat) redirect("/room");
  const [{ data: room }, { count }, { data: state }, { data: drawState }, { data: gomokuState }, { data: golfState }, names] = await Promise.all([
    supabase.from("couple_rooms").select("id, mood, timezone").eq("id", seat.room_id).maybeSingle(),
    supabase.from("couple_members").select("user_id", { count: "exact", head: true }).eq("room_id", seat.room_id),
    which === "guess" ? supabase.rpc("guess_state", { target: seat.room_id }) : Promise.resolve({ data: null }),
    which === "draw" ? supabase.rpc("draw_state", { target: seat.room_id }) : Promise.resolve({ data: null }),
    which === "gomoku" ? supabase.rpc("gomoku_state", { target: seat.room_id }) : Promise.resolve({ data: null }),
    which === "golf" ? supabase.rpc("golf_state", { target: seat.room_id }) : Promise.resolve({ data: null }),
    roomNames(supabase, seat.room_id, auth.user.id),
  ]);
  if (!room) redirect("/room");
  const day = roomToday(new Date(), room.timezone);
  const full = (count ?? 0) >= 2;
  const partnerName = names.partnerNick ?? t("common.partner");
  const games = [["guess", "/room/game"], ["draw", "/room/game?g=draw"], ["gomoku", "/room/game?g=gomoku"], ["golf", "/room/game?g=golf"], ["post", "/room/game?g=post"]] as const;

  return (
    <RoomShell>
      <div className="room" data-mood={isMood(room.mood) ? room.mood : "berry"}>
        <RoomTabs active="game" />
        <h1 className="visually-hidden">{t("game.title")}</h1>
        {full ? (
          <>
            <nav className="game-switch" aria-label={t("game.pick")}>
              {games.map(([key, href]) => (
                <a key={key} href={href} aria-current={which === key ? "page" : undefined}>{t(`game.${key}`)}</a>
              ))}
            </nav>
            {which === "post" ? (
              <PostcardGame key={room.id + day} roomId={room.id} day={day} />
            ) : which === "golf" ? (
              <GolfGame roomId={room.id} partnerName={partnerName} initial={(golfState as GolfState | null) ?? { game: null, best: {}, nowMs: Date.now() }} />
            ) : which === "gomoku" ? (
              <GomokuGame roomId={room.id} partnerName={partnerName} initial={(gomokuState as GomokuState | null) ?? { game: null, myWins: 0, partnerWins: 0, draws: 0 }} />
            ) : which === "draw" ? (
              <DrawGame roomId={room.id} partnerName={partnerName} initial={(drawState as DrawState | null) ?? { game: null, nowMs: Date.now(), records: {} }} />
            ) : (
              <GuessGame roomId={room.id} partnerName={partnerName} initial={(state as GuessState | null) ?? { game: null }} />
            )}
          </>
        ) : (
          <p className="notice">{t("game.needPartner")} <a href="/room">{t("chat.inviteLink")}</a></p>
        )}
      </div>
    </RoomShell>
  );
}
