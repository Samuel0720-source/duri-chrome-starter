import { getT } from "../../i18n/server";

export type RoomTab = "home" | "game" | "watch" | "album" | "chat" | "settings";

// The room's main menu: 홈 / 게임 / 함께 보기 / 앨범 / 대화 / 설정.
export async function RoomTabs({ active }: { active: RoomTab }) {
  const { t } = await getT();
  const tabs: [RoomTab, string, string][] = [
    ["home", "/room", t("tabs.home")],
    ["game", "/room/game", t("tabs.game")],
    ["watch", "/room/watch", t("tabs.watch")],
    ["album", "/room/album", t("tabs.album")],
    ["chat", "/room/chat", t("tabs.chat")],
    ["settings", "/room/settings", t("tabs.settings")],
  ];
  return (
    <nav className="room-tabs" aria-label={t("tabs.label")}>
      {tabs.map(([key, href, label]) => (
        <a key={key} href={href} aria-current={active === key ? "page" : undefined}>{label}</a>
      ))}
    </nav>
  );
}
