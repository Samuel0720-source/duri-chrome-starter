// Pure chat helpers: read receipts and "how long ago".
export type ChatMsg = { id: number; sender: string | null };

// The newest saved message I sent (unsent ones have negative ids).
export function lastMineId(messages: ChatMsg[], me: string): number | null {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].sender === me && messages[i].id > 0) return messages[i].id;
  return null;
}

// Seen when my partner has read up to (at least) my last message.
export function seenStatus(lastMine: number | null, partnerReadUpto: number): "none" | "seen" | "unseen" {
  if (lastMine === null) return "none";
  return partnerReadUpto >= lastMine ? "seen" : "unseen";
}

// "방금" under a minute, then minutes, hours, days.
export function ago(nowMs: number, atMs: number): { key: "rel.now" | "rel.min" | "rel.hour" | "rel.day"; n: number } {
  const s = Math.max(0, Math.floor((nowMs - atMs) / 1000));
  if (s < 60) return { key: "rel.now", n: 0 };
  if (s < 3600) return { key: "rel.min", n: Math.floor(s / 60) };
  if (s < 86400) return { key: "rel.hour", n: Math.floor(s / 3600) };
  return { key: "rel.day", n: Math.floor(s / 86400) };
}

// Show the partner's name above a message only when the sender changes.
export function startsGroup(messages: ChatMsg[], index: number): boolean {
  return index === 0 || messages[index - 1].sender !== messages[index].sender;
}
