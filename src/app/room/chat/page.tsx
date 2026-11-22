import Link from "next/link";
import { redirect } from "next/navigation";
import { roomToday } from "../../../core/dates";
import { postcardQuestion } from "../../../core/postcards";
import { isMood } from "../../../core/moods";
import { getT } from "../../../i18n/server";
import { roomAccess, roomDetails, roomMemberCount } from "../../../lib/room-render";
import { RoomTabs } from "../room-tabs";
import { RoomShell } from "../room-shell";
import { Chat, type Message } from "./chat";

export const dynamic = "force-dynamic";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const { t } = await getT();
  const { supabase, auth, seat } = await roomAccess();
  if (!supabase) redirect("/login?error=config");
  if (!auth.user) redirect("/login?next=/room/chat");
  const me = auth.user.id;
  if (!seat) redirect("/room");
  const [room, count, { data: recent }, { data: prefs }] = await Promise.all([
    roomDetails(),
    roomMemberCount(),
    supabase.from("room_messages").select("id, sender, body, created_at").eq("room_id", seat.room_id).order("id", { ascending: false }).limit(50),
    supabase.from("member_prefs").select("user_id, partner_nickname, read_upto, read_at").eq("room_id", seat.room_id),
  ]);
  if (!room) redirect("/room");
  const full = (count ?? 0) >= 2;
  const prompt = (await searchParams).prompt === "today" ? t(postcardQuestion(roomToday(new Date(), room.timezone))) : "";
  const initial: Message[] = (recent ?? []).reverse();
  const mine = (prefs ?? []).find((p) => p.user_id === me);
  const theirs = (prefs ?? []).find((p) => p.user_id !== me);

  return (
    <RoomShell>
      <div className="room" data-mood={isMood(room.mood) ? room.mood : "berry"}>
        <RoomTabs active="chat" />
        <section className="chat-wrap" aria-labelledby="chat-head">
          <h1 id="chat-head" className="visually-hidden">{t("chat.title")}</h1>
          {full ? (
            <Chat
              roomId={room.id}
              me={me}
              prompt={prompt}
              zone={room.timezone}
              initial={initial}
              partnerName={mine?.partner_nickname ?? t("common.partner")}
              initialPartnerRead={{ upto: Number(theirs?.read_upto ?? 0), atMs: theirs?.read_at ? Date.parse(theirs.read_at) : null }}
              initialMyRead={Number(mine?.read_upto ?? 0)}
            />
          ) : (
            <p className="notice">{t("chat.needPartner")} <Link href="/room">{t("chat.inviteLink")}</Link></p>
          )}
        </section>
      </div>
    </RoomShell>
  );
}
