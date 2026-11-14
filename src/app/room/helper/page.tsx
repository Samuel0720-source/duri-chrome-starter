import { redirect } from "next/navigation";
import { isMood } from "../../../core/moods";
import { getT } from "../../../i18n/server";
import { serverClient } from "../../../lib/supabase/server";
import { RoomTabs } from "../room-tabs";
import { RoomShell } from "../room-shell";
import { Helper, type Usage } from "./helper";

export const dynamic = "force-dynamic";

export default async function HelperPage() {
  const { t } = await getT();
  const supabase = await serverClient();
  if (!supabase) redirect("/login?error=config");
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/room/helper");
  const { data: seat } = await supabase.from("couple_members").select("room_id").eq("user_id", auth.user.id).maybeSingle();
  if (!seat) redirect("/room");
  const [{ data: room }, { count }] = await Promise.all([
    supabase.from("couple_rooms").select("id, mood").eq("id", seat.room_id).maybeSingle(),
    supabase.from("couple_members").select("user_id", { count: "exact", head: true }).eq("room_id", seat.room_id),
  ]);
  if (!room) redirect("/room");
  const { data: usage } = await supabase.rpc("api_usage", { target: room.id });

  return (
    <RoomShell>
      <div className="room" data-mood={isMood(room.mood) ? room.mood : "berry"}>
        <RoomTabs active="helper" />
        <h1 className="visually-hidden">{t("helper.title")}</h1>
        <Helper hasPartner={(count ?? 0) >= 2} usage={usage as Usage | null} />
      </div>
    </RoomShell>
  );
}
