import { redirect } from "next/navigation";
import { isMood } from "../../../core/moods";
import { getT } from "../../../i18n/server";
import { serverClient } from "../../../lib/supabase/server";
import { roomNames } from "../../../lib/room-names";
import { RoomTabs } from "../room-tabs";
import { RoomShell } from "../room-shell";
import { WatchTogether } from "./watch-together";

export const dynamic = "force-dynamic";

export default async function WatchPage() {
  const { t } = await getT();
  const supabase = await serverClient();
  if (!supabase) redirect("/login?error=config");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/room/watch");
  const { data: seat } = await supabase.from("couple_members").select("room_id").eq("user_id", auth.user.id).maybeSingle();
  if (!seat) redirect("/room");
  const [{ data: room }, { count }, names] = await Promise.all([
    supabase.from("couple_rooms").select("id, mood").eq("id", seat.room_id).maybeSingle(),
    supabase.from("couple_members").select("user_id", { count: "exact", head: true }).eq("room_id", seat.room_id),
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
