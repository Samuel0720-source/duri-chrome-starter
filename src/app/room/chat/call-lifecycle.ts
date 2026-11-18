"use client";

// One call owner per document. Sign-out waits for its final authenticated signal
// before the server clears cookies, but never waits indefinitely when offline.
let stop: (() => Promise<void>) | undefined;
export function registerCallStop(handler: () => Promise<void>) {
  stop = handler;
  return () => { if (stop === handler) stop = undefined; };
}
export async function stopRoomCall() {
  if (!stop) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([stop(), new Promise<void>(resolve => { timer = setTimeout(resolve, 2000); })]);
  } finally { clearTimeout(timer); }
}
