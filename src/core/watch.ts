// "함께 보기" small pure helpers. The database keeps the timetable; these only read it.
import { shouldCorrectDrift } from "./playback.ts";

export type WatchState = {
  videoId: string | null;
  positionSec: number; // reference position (seconds)
  refMs: number; // database time (epoch ms) at which positionSec was true
  nowMs: number; // database time when this state was read
  playing: boolean;
  revision: number; // grows by one on every video / play / pause / seek change
  by: "me" | "partner" | null;
  meReady: boolean;
  partnerReady: boolean;
  partnerHere: boolean;
};

// Takes the same links the database accepts (watch, youtu.be, shorts, embed, live). Returns the 11-character id.
const HOST = /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i;
const ID = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|live\/|v\/)|[?&]v=)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;
export function parseYouTube(raw: string): string | null {
  const text = raw.trim();
  if (text.length === 0 || text.length > 300 || !HOST.test(text)) return null;
  return ID.exec(text)?.[1] ?? null;
}

// Where the video should be right now. Playing: reference + time since the reference. Paused: the reference.
export function targetPosition(
  s: Pick<WatchState, "positionSec" | "refMs" | "playing">,
  deviceNowMs: number,
  offsetMs: number,
): number {
  if (!s.playing) return s.positionSec;
  return s.positionSec + Math.max(0, (deviceNowMs + offsetMs - s.refMs) / 1000);
}

// What to do with a state read from the database.
//  stale: its revision is not newer than one already handled.
//  own:   this device caused it (its revision came back from my own command, or I was the last to act).
//  apply: a partner / system change the player has to follow.
export function classifyRevision(
  revision: number,
  lastHandled: number,
  by: WatchState["by"],
  mine: ReadonlySet<number>,
): "stale" | "own" | "apply" {
  if (revision <= lastHandled) return "stale";
  if (mine.has(revision) || by === "me") return "own";
  return "apply";
}

// The periodic check (every 2 s) runs only while both are here and ready and the player is not buffering.
export function shouldCheckDrift(s: Pick<WatchState, "playing" | "meReady" | "partnerReady" | "partnerHere">, buffering: boolean): boolean {
  return s.playing && s.meReady && s.partnerReady && s.partnerHere && !buffering;
}

export { shouldCorrectDrift };

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

// YouTube's player error codes -> what the person should do next.
export function playerErrorMessage(code: number): string {
  if (code === 101 || code === 150) return "이 영상은 퍼가기가 막혀 있어서 여기서 같이 볼 수 없어요. 다른 영상 링크를 넣어 주세요.";
  if (code === 100) return "삭제됐거나 비공개인 영상이에요. 다른 영상 링크를 넣어 주세요.";
  if (code === 2) return "링크의 영상 번호가 올바르지 않아요. 링크를 다시 확인해 주세요.";
  return "영상을 불러오지 못했어요. 잠시 뒤에 다시 하거나 다른 영상을 골라 주세요.";
}
