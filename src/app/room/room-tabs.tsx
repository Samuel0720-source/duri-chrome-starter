// The room's main menu: 홈 / 게임 / 함께 보기 / 도우미 / 대화.
export function RoomTabs({ active }: { active: "home" | "game" | "watch" | "helper" | "chat" }) {
  return (
    <nav className="room-tabs" aria-label="방 메뉴">
      <a href="/room" aria-current={active === "home" ? "page" : undefined}>홈</a>
      <a href="/room/game" aria-current={active === "game" ? "page" : undefined}>게임</a>
      <a href="/room/watch" aria-current={active === "watch" ? "page" : undefined}>함께 보기</a>
      <a href="/room/helper" aria-current={active === "helper" ? "page" : undefined}>도우미</a>
      <a href="/room/chat" aria-current={active === "chat" ? "page" : undefined}>대화</a>
    </nav>
  );
}
