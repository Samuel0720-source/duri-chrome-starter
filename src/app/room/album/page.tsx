import { redirect } from "next/navigation";
import { MAX_PHOTOS } from "../../../core/album";
import { isMood } from "../../../core/moods";
import { getT } from "../../../i18n/server";
import { roomNames } from "../../../lib/room-names";
import { roomAccess, roomDetails, roomMemberCount } from "../../../lib/room-render";
import { RoomLive } from "../room-live";
import { RoomShell } from "../room-shell";
import { RoomTabs } from "../room-tabs";
import { Album, type Photo } from "./album";

export const dynamic = "force-dynamic";

const notices = { wallpaper: "album.saved", deleted: "album.deleted" } as const;
const errors = { gone: "album.err.gone" } as const;

// The couple's album. Photos are listed here; the bytes come from /api/photo/<id>.
export default async function AlbumPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { t, locale } = await getT();
  const { supabase, auth, seat } = await roomAccess();
  if (!supabase) redirect("/login?error=config");
  if (!auth.user) redirect("/login?next=/room/album");
  const me = auth.user.id;
  if (!seat) redirect("/room");
  const [room, count, { data: rows }, names] = await Promise.all([
    roomDetails(),
    roomMemberCount(),
    supabase.from("room_photos").select("id, added_by, width, height, created_at").eq("room_id", seat.room_id).order("created_at", { ascending: false }),
    roomNames(supabase, seat.room_id, me),
  ]);
  if (!room) redirect("/room");
  const { saved, error } = await searchParams;
  const day = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-CA", { dateStyle: "medium", timeZone: room.timezone });
  const photos: Photo[] = (rows ?? []).map((r) => ({
    id: r.id,
    width: r.width,
    height: r.height,
    mine: r.added_by === me,
    date: day.format(new Date(r.created_at)),
  }));
  const partner = names.partnerNick ?? t("common.partner");
  const full = (count ?? 0) >= 2;

  return (
    <RoomShell>
      <div className="room" data-mood={isMood(room.mood) ? room.mood : "berry"}>
        <RoomLive roomId={room.id} />
        <RoomTabs active="album" />
        <section className="album-wrap" aria-labelledby="album-head">
          <div className="album-head">
            <h1 id="album-head">{t("album.title")}</h1>
            <p className="hint">{t("album.count", { n: String(photos.length), max: String(MAX_PHOTOS) })}</p>
          </div>
          {saved && saved in notices && <p role="status" className="hit">{t(notices[saved as keyof typeof notices])}</p>}
          {error && error in errors && <p role="alert" className="error">{t(errors[error as keyof typeof errors])}</p>}
          {full ? (
            <Album roomId={room.id} photos={photos} wallpaper={room.wallpaper} partner={partner} />
          ) : (
            <p className="hint">{t("album.needPartner")}</p>
          )}
        </section>
      </div>
    </RoomShell>
  );
}
