// The room's main menu. Watch-together joins in a later step.
export function RoomTabs({ active }: { active: "home" | "game" | "chat" }) {
  return (
    <nav className="room-tabs" aria-label="방 메뉴">
      <a href="/room" aria-current={active === "home" ? "page" : undefined}>홈</a>
      <a href="/room/game" aria-current={active === "game" ? "page" : undefined}>게임</a>
      <a href="/room/chat" aria-current={active === "chat" ? "page" : undefined}>대화</a>
    </nav>
  );
}
