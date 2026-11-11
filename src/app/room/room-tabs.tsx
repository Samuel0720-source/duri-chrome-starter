// The room's main menu. Game and watch-together tabs join in later steps.
export function RoomTabs({ active }: { active: "home" | "chat" }) {
  return (
    <nav className="room-tabs" aria-label="방 메뉴">
      <a href="/room" aria-current={active === "home" ? "page" : undefined}>홈</a>
      <a href="/room/chat" aria-current={active === "chat" ? "page" : undefined}>대화</a>
    </nav>
  );
}
