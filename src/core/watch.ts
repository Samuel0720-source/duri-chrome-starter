// "함께 보기" small pure helpers. The database keeps the timetable; these only read it.
import { shouldCorrectDrift } from "./playback.ts";

export type VideoSource = "youtube" | "vimeo" | "file" | "netflix";
export type WatchState = {
  source?: VideoSource; // older states (before Vimeo / files) have no source: YouTube
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

// The same rules as duri_private.parse_video: YouTube, Vimeo (with the hash of an unlisted video), or an https
// address of a video file the browser can play.
const VIMEO = /^https?:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/|channels\/[A-Za-z0-9_-]+\/)?([0-9]{5,12})(?:\/([0-9a-f]{6,24}))?(?:[/?#].*)?$/i;
// Netflix: only the title number. Each person plays it in their own Netflix tab; the extension keeps time.
const NETFLIX = /^https?:\/\/(?:www\.)?netflix\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:watch|title)\/([0-9]{5,12})(?:[/?#].*)?$/i;
const FILE = /^https:\/\/[^\s"'<>\\]+\.(mp4|webm|ogg|ogv|mov|m4v)([?#][^\s"'<>\\]*)?$/i;
export function parseVideo(raw: string): { source: VideoSource; ref: string } | null {
  const text = raw.trim();
  if (text.length === 0 || text.length > 600) return null;
  const yt = parseYouTube(text);
  if (yt) return { source: "youtube", ref: yt };
  const v = VIMEO.exec(text);
  if (v) {
    const hash = v[2] ?? /[?&]h=([0-9a-fA-F]{6,24})/.exec(text)?.[1];
    return { source: "vimeo", ref: v[1] + (hash ? ":" + hash.toLowerCase() : "") };
  }
  const n = NETFLIX.exec(text);
  if (n) return { source: "netflix", ref: n[1] };
  if (FILE.test(text)) return { source: "file", ref: text };
  return null;
}

// Where the original can be opened in a new tab.
export function videoPage(source: VideoSource, ref: string): string {
  if (source === "youtube") return "https://www.youtube.com/watch?v=" + ref;
  if (source === "vimeo") return "https://vimeo.com/" + ref.split(":")[0];
  if (source === "netflix") return "https://www.netflix.com/watch/" + ref;
  return ref;
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

// YouTube's player error codes -> a dictionary key saying what to do next.
export function playerErrorKey(code: number) {
  if (code === 101 || code === 150) return "watch.err.embed" as const;
  if (code === 100) return "watch.err.gone" as const;
  if (code === 2) return "watch.err.id" as const;
  return "watch.err.load" as const;
}
