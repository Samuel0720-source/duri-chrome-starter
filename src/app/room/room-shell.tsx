import Link from "next/link";
import { photoUrl } from "../../core/album";
import { getT } from "../../i18n/server";
import { roomDetails } from "../../lib/room-render";
import { SignOutForm } from "./sign-out-form";

// Top bar of every signed-in screen: the brand and "로그아웃".
export async function RoomShell({ children, wide = true }: { children: React.ReactNode; wide?: boolean }) {
  const [{ t }, room] = await Promise.all([getT(), roomDetails()]);
  const wallpaper = room?.wallpaper ?? null;
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
