import { redirect } from "next/navigation";
import { isMood } from "../../../core/moods";
import { getT } from "../../../i18n/server";
import { getRoomSession, getRoomSummary } from "../../../lib/room-context";
import { roomNames } from "../../../lib/room-names";
import { RoomTabs } from "../room-tabs";
import { RoomShell } from "../room-shell";
import { WatchTogether } from "./watch-together";

export const dynamic = "force-dynamic";

export default async function WatchPage() {
  const { t } = await getT();
  const { supabase, user, roomId } = await getRoomSession();
  if (!supabase) redirect("/login?error=config");
  if (!user) redirect("/login?next=/room/watch");
  if (!roomId) redirect("/room");
  const [summary, names] = await Promise.all([
    getRoomSummary(roomId),
    roomNames(supabase, roomId, user.id),
  ]);
  const { room, count } = summary;
  if (!room) redirect("/room");

  return (
    <RoomShell>
      <div className="room" data-mood={isMood(room.mood) ? room.mood : "berry"}>
        <RoomTabs active="watch" />
        <h1 className="visually-hidden">{t("watch.title")}</h1>
        <WatchTogether roomId={room.id} hasPartner={count >= 2} partnerName={names.partnerNick ?? t("common.partner")} />
      </div>
    </RoomShell>
  );
}
