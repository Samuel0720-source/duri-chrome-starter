"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { type CallController, type View } from "./call-session";
import { createCallOwner } from "./call-owner";
import { createPopupCall } from "./popup-call";
import { registerCallStop } from "./call-lifecycle";
import { CallControls } from "./call-controls";

export function CallDock({ me, roomId, mood }: { me: string; roomId: string; mood: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useRef<CallController | null>(null);
  const [view, setView] = useState<View>({ phase: "idle", mode: "audio", note: "hint" });
  const [ready, setReady] = useState(false);
  const dock = useRef<HTMLDivElement>(null);
  const shown = pathname === "/room/chat" || view.phase !== "idle";
  useEffect(() => {
    const background = document.documentElement.dataset.callBackground === "1";
    const updateReady = (value: boolean) => {
      setReady(value); document.documentElement.dataset.callLive = value ? "on" : "off";
    };
    const owner = background
      ? createPopupCall(me, roomId, setView, updateReady)
      : createCallOwner(me, roomId, setView, updateReady, () => router.refresh());
    if (!owner) return;
    session.current = owner.session;
    const unregister = registerCallStop(() => owner.session.end());
    const leave = () => { if (!background) void owner.session.end(); };
    window.addEventListener("pagehide", leave);
    return () => {
      unregister(); window.removeEventListener("pagehide", leave);
      owner.dispose(); session.current = null;
      delete document.documentElement.dataset.callLive;
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
