import { callClient } from "../../../lib/supabase/browser";
import { isIceList } from "../../../core/ice";
import { CallSession, type View } from "./call-session";

// Shared call engine for a normal website document or the extension's hidden host.
// UI lifetimes never own signaling when the extension is keeping a call alive.
export function createCallOwner(me: string, roomId: string, render: (view: View) => void,
  ready: (value: boolean) => void, refresh: () => void) {
  const client = callClient();
  if (!client) return null;
  let active = true;
  const session = new CallSession(me, async (id, kind, detail) => {
    const { error } = await client.rpc("signal_room_call", { target: roomId, session_id: id, kind, detail });
    if (error) throw new Error("Signaling unavailable");
  }, value => { if (active) render(value); }, async () => {
    const response = await fetch("/api/call/ice", { cache: "no-store" });
    const body = response.ok ? await response.json() : null;
    if (!isIceList(body?.iceServers)) throw new Error("No call servers");
    return body.iceServers as RTCIceServer[];
  });
  void (async () => {
    try {
      await client.realtime.setAuth();
      if (!active) return;
      client.channel("room:" + roomId, { config: { private: true } })
        .on("broadcast", { event: "call" }, ({ payload }) => { void session.receive(payload); })
        .on("broadcast", { event: "members" }, () => { void session.end("offline"); refresh(); })
        .on("broadcast", { event: "room" }, refresh)
        .subscribe(status => {
          if (!active) return;
          const connected = status === "SUBSCRIBED";
          ready(connected && !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== "undefined");
          if (!connected) void session.end("offline", false);
        });
    } catch { if (active) { ready(false); void session.end("offline", false); } }
  })();
  return { session, dispose() {
    active = false;
    void session.end();
    void client.removeAllChannels().finally(() => client.realtime.disconnect());
  } };
}
