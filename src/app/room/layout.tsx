import type { ReactNode } from "react";
import { roomAccess, roomDetails, roomMemberCount } from "../../lib/room-render";
import { isMood } from "../../core/moods";
import { CallDock } from "./chat/call-dock";

// This layout survives client navigation between every /room screen.
export default async function RoomLayout({ children }: { children: ReactNode }) {
  const [{ auth: { user: auth } }, room, count] = await Promise.all([
    roomAccess(), roomDetails(), roomMemberCount(),
  ]);
  return <>{children}{auth && room && (count ?? 0) >= 2 && <CallDock key={auth.id + room.id} me={auth.id} roomId={room.id} mood={isMood(room.mood) ? room.mood : "berry"} />}</>;
}
