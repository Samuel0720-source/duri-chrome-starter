"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import type { browserClient } from "../../lib/supabase/browser";

// Attach shared room changes to each screen's existing channel so a new theme
// reaches both partners even during a call, movie or game.
export function useRoomChannel(roomId: string) {
  const router = useRouter();
  return useCallback((client: NonNullable<ReturnType<typeof browserClient>>) =>
    client.channel("room:" + roomId, { config: { private: true } })
      .on("broadcast", { event: "room" }, () => router.refresh()), [roomId, router]);
}
