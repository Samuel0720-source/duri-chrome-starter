"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { callClient } from "../../../lib/supabase/browser";
import { isIceList } from "../../../core/ice";
import { CallSession, type View } from "./call-session";
import { CallControls } from "./call-controls";

export function CallDock({ me, roomId, mood }: { me: string; roomId: string; mood: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useRef<CallSession | null>(null);
  const [view, setView] = useState<View>({ phase: "idle", mode: "audio", note: "hint" });
  const [ready, setReady] = useState(false);
  const dock = useRef<HTMLDivElement>(null);
  const shown = pathname === "/room/chat" || view.phase !== "idle";
  useEffect(() => {
    // A separate realtime connection prevents page subscriptions from replacing
    // the persistent call listener for the same private room topic.
    const client = callClient();
    if (!client) return;
    let active = true;
    const call = new CallSession(me, async (id, kind, detail) => {
      const { error } = await client.rpc("signal_room_call", { target: roomId, session_id: id, kind, detail });
      if (error) throw new Error("Signaling unavailable");
    }, value => { if (active) setView(value); }, async () => {
      const response = await fetch("/api/call/ice", { cache: "no-store" });
      const body = response.ok ? await response.json() : null;
      if (!isIceList(body?.iceServers)) throw new Error("No call servers");
      return body.iceServers as RTCIceServer[];
    });
    session.current = call;
    const leave = () => call.end();
    window.addEventListener("pagehide", leave);
    void (async () => {
      try {
        await client.realtime.setAuth();
        if (!active) return;
        client.channel("room:" + roomId, { config: { private: true } })
          .on("broadcast", { event: "call" }, ({ payload }) => { void call.receive(payload); })
          .on("broadcast", { event: "members" }, () => { call.end("offline"); router.refresh(); })
          .on("broadcast", { event: "room" }, () => router.refresh())
          .subscribe(status => {
            if (!active) return;
            const connected = status === "SUBSCRIBED";
            setReady(connected && !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== "undefined");
            document.documentElement.dataset.callLive = connected ? "on" : "off";
            if (!connected) call.end("offline", false);
          });
      } catch { if (active) { setReady(false); call.end("offline", false); } }
    })();
    return () => {
      active = false;
      window.removeEventListener("pagehide", leave);
      call.end();
      session.current = null;
      delete document.documentElement.dataset.callLive;
      void client.removeAllChannels().finally(() => client.realtime.disconnect());
    };
  }, [me, roomId, router]);
  useEffect(() => {
    const element = dock.current;
    if (!element) return;
    const measure = () => document.documentElement.style.setProperty("--call-dock-height", shown ? `${element.offsetHeight + 12}px` : "0px");
    const observer = new ResizeObserver(measure);
    observer.observe(element); measure();
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--call-dock-height"); };
  }, [shown]);
  return <div ref={dock} className="call-dock" data-mood={mood} hidden={!shown}>
    <CallControls session={session.current} view={view} ready={ready} compact={pathname !== "/room/chat"} />
  </div>;
}
