import { redirect } from "next/navigation";
import { isMood } from "../../../core/moods";
import { getT } from "../../../i18n/server";
import { roomAccess, roomDetails, roomMemberCount } from "../../../lib/room-render";
import { roomNames } from "../../../lib/room-names";
import { RoomTabs } from "../room-tabs";
import { RoomShell } from "../room-shell";
import { WatchTogether } from "./watch-together";

export const dynamic = "force-dynamic";

export default async function WatchPage() {
  const { t } = await getT();
  const { supabase, auth, seat } = await roomAccess();
  if (!supabase) redirect("/login?error=config");
  if (!auth.user) redirect("/login?next=/room/watch");
  if (!seat) redirect("/room");
  const [room, count, names] = await Promise.all([
    roomDetails(),
    roomMemberCount(),
    roomNames(supabase, seat.room_id, auth.user.id),
  ]);
  if (!room) redirect("/room");

  return (
    <RoomShell>
      <div className="room" data-mood={isMood(room.mood) ? room.mood : "berry"}>
        <RoomTabs active="watch" />
        <h1 className="visually-hidden">{t("watch.title")}</h1>
        <WatchTogether roomId={room.id} hasPartner={(count ?? 0) >= 2} partnerName={names.partnerNick ?? t("common.partner")} />
      </div>
    </RoomShell>
  );
}
