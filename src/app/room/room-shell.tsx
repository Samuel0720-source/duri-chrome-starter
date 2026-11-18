import Link from "next/link";
import { photoUrl } from "../../core/album";
import { getT } from "../../i18n/server";
import { getRoomSession, getRoomSummary } from "../../lib/room-context";
import { SignOutForm } from "./sign-out-form";

// The room's shared background photo, if one is set (row level security returns only my room).
async function wallpaperOf(): Promise<string | null> {
  const { roomId } = await getRoomSession();
  if (!roomId) return null;
  const { room } = await getRoomSummary(roomId);
  return (room?.wallpaper as string | null) ?? null;
}

// Top bar of every signed-in screen: the brand and "로그아웃".
export async function RoomShell({ children, wide = true }: { children: React.ReactNode; wide?: boolean }) {
  const [{ t }, wallpaper] = await Promise.all([getT(), wallpaperOf()]);
  return (
    <main className={wide ? "wrap room-wrap" : "wrap auth"} data-wallpaper={wallpaper ?? undefined}>
      {wallpaper && <div className="wallpaper" aria-hidden="true" style={{ backgroundImage: `url(${photoUrl(wallpaper)})` }} />}
      <header className="top">
        <Link className="brand" href="/room">
          <span className="room-mascot" aria-hidden="true" />
          {t("app.name")}
        </Link>
        <SignOutForm label={t("common.signOut")} />
      </header>
      {children}
    </main>
  );
}
