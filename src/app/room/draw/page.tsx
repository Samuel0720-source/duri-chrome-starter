import Link from "next/link";
import { redirect } from "next/navigation";
import { isMood } from "../../../core/moods";
import type { SketchState } from "../../../core/sketch";
import { getT } from "../../../i18n/server";
import { getRoomSession, getRoomSummary } from "../../../lib/room-context";
import { roomNames } from "../../../lib/room-names";
import { RoomShell } from "../room-shell";
import { RoomTabs } from "../room-tabs";
import { SketchBoard } from "./sketch-board";

export const dynamic = "force-dynamic";

export default async function DrawPage() {
  const { t } = await getT();
  const { supabase, user, roomId } = await getRoomSession();
  if (!supabase) redirect("/login?error=config");
  if (!user) redirect("/login?next=/room/draw");
  if (!roomId) redirect("/room");

  const [summary, { data: initial }, names] = await Promise.all([
    getRoomSummary(roomId),
    supabase.rpc("sketch_state", { target: roomId, since_seq: 0, since_rev: null }),
    roomNames(supabase, roomId, user.id),
  ]);
  const { room, count } = summary;
  if (!room) redirect("/room");

  const full = count >= 2;
  const partnerName = names.partnerNick ?? t("common.partner");

  return (
    <RoomShell>
      <div className="room" data-mood={isMood(room.mood) ? room.mood : "berry"}>
        <RoomTabs active="draw" />
        <h1 className="visually-hidden">{t("sketch.title")}</h1>
        {full ? (
          <SketchBoard
            roomId={room.id}
            partnerName={partnerName}
            initial={(initial as SketchState | null) ?? { bg: "paper", revision: 0, latestSeq: 0, strokes: [], hasExtensionToken: false }}
          />
        ) : (
          <p className="notice">{t("sketch.needPartner")} <Link href="/room">{t("chat.inviteLink")}</Link></p>
        )}
      </div>
    </RoomShell>
  );
}
