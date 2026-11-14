"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "../../lib/supabase/browser";

// Listens on the room's private channel and re-renders the page when a partner joins or leaves,
// or the theme, background, plans or album change.
export function RoomLive({ roomId }: { roomId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = browserClient();
    if (!supabase) return;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    (async () => {
      // Private channels authorize with the signed-in user's token.
      await supabase.realtime.setAuth();
      if (!active) return;
      channel = supabase
        .channel("room:" + roomId, { config: { private: true } })
        .on("broadcast", { event: "members" }, () => router.refresh())
        .on("broadcast", { event: "room" }, () => router.refresh())
        .on("broadcast", { event: "plans" }, () => router.refresh())
        .on("broadcast", { event: "photos" }, () => router.refresh())
        // The data attribute lets tests (and debugging) see the channel is live.
        .subscribe((status) => {
          document.documentElement.dataset.roomLive = status === "SUBSCRIBED" ? "on" : "off";
        });
    })();
    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId, router]);
  return null;
}
