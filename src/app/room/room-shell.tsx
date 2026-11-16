import { photoUrl } from "../../core/album";
import { getT } from "../../i18n/server";
import { serverClient } from "../../lib/supabase/server";
import { signOut } from "./actions";

// The room's shared background photo, if one is set (row level security returns only my room).
async function wallpaperOf(): Promise<string | null> {
  const supabase = await serverClient();
  if (!supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data: seat } = await supabase.from("couple_members").select("room_id").eq("user_id", auth.user.id).maybeSingle();
  if (!seat) return null;
  const { data: room } = await supabase.from("couple_rooms").select("wallpaper").eq("id", seat.room_id).maybeSingle();
  return (room?.wallpaper as string | null) ?? null;
}

// Top bar of every signed-in screen: the brand and "로그아웃".
export async function RoomShell({ children, wide = true }: { children: React.ReactNode; wide?: boolean }) {
  const [{ t }, wallpaper] = await Promise.all([getT(), wallpaperOf()]);
  return (
    <main className={wide ? "wrap room-wrap" : "wrap auth"} data-wallpaper={wallpaper ?? undefined}>
      {wallpaper && <div className="wallpaper" aria-hidden="true" style={{ backgroundImage: `url(${photoUrl(wallpaper)})` }} />}
      <header className="top">
        <a className="brand" href="/room">
          <span className="room-mascot" aria-hidden="true" />
          {t("app.name")}
        </a>
        <form action={signOut}>
          <button type="submit" className="link">{t("common.signOut")}</button>
        </form>
      </header>
      {children}
    </main>
  );
}
