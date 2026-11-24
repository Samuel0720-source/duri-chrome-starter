import { roomAccess, roomMemberCount } from "../../lib/room-render";
import { CallHost } from "./call-host";
export const dynamic = "force-dynamic";
export default async function CallHostPage() {
  const { auth, seat } = await roomAccess();
  const count = await roomMemberCount();
  return auth.user && seat && (count ?? 0) >= 2
    ? <CallHost me={auth.user.id} roomId={seat.room_id} />
    : <p>Sign in and connect with your partner in Duri.</p>;
}
