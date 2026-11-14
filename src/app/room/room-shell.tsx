import { getT } from "../../i18n/server";
import { signOut } from "./actions";

// Top bar of every signed-in screen: the brand and "로그아웃".
export async function RoomShell({ children, wide = true }: { children: React.ReactNode; wide?: boolean }) {
  const { t } = await getT();
  return (
    <main className={wide ? "wrap room-wrap" : "wrap auth"}>
      <header className="top">
        <a className="brand" href="/room">
          <img alt="" width="32" height="32" src="/icons/icon-192.png" />
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
