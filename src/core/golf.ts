// 미니골프 types and small pure helpers. The physics (one roll per shot) runs in the database;
// the browser only replays the stored path and turns a finger drag into an angle and a power.
export type Point = [number, number];
export type Rect = [number, number, number, number];
export type GolfBall = {
  x: number;
  y: number;
  strokes: number; // this hole
  total: number; // finished holes
  holed: boolean;
  water: boolean; // last shot ended in water (+1 penalty, back where it was hit from)
  shotNo: number;
  startedMs: number | null;
  untilMs: number;
  path: Point[] | null; // one point per tick (1/60 s); path[0] is where it was hit from
};
export type GolfCourse = {
  w: number;
  h: number;
  ball: number;
  n: number;
  name: string;
  tee: Point;
  cup: { x: number; y: number; r: number };
  walls: Rect[];
  sand: Rect[];
  water: Rect[];
};
export type GolfState =
  | { game: null; best: Record<string, number>; nowMs: number }
  | {
      game: string;
      holes: 3 | 6 | 9;
      hole: number;
      status: "open" | "done" | "cancelled";
      course: GolfCourse;
      me: GolfBall;
      partner: GolfBall;
      best: Record<string, number>;
      nowMs: number;
    };

export const HOLE_CHOICES = [3, 6, 9] as const;
export const MAX_PULL = 200; // logical px of drag that means full power
export const MIN_POWER = 0.05;
export const TICK_MS = 1000 / 60;

// Where a ball is `elapsed` ms after its shot started. The stored path has one point per tick.
export function ballAt(ball: GolfBall, elapsed: number): { x: number; y: number; moving: boolean } {
  const path = ball.path;
  if (!path || path.length < 2 || ball.startedMs === null) return { x: ball.x, y: ball.y, moving: false };
  const duration = ball.untilMs - ball.startedMs;
  if (elapsed >= duration) return { x: ball.x, y: ball.y, moving: false };
  if (elapsed <= 0) return { x: path[0][0], y: path[0][1], moving: true };
  const f = Math.min(path.length - 1, elapsed / TICK_MS);
  const i = Math.min(path.length - 2, Math.floor(f));
  const t = f - i;
  return { x: path[i][0] + (path[i + 1][0] - path[i][0]) * t, y: path[i][1] + (path[i + 1][1] - path[i][1]) * t, moving: true };
}

// Database clock = this device's clock + offset. Each reading is taken halfway through the request
// (t0 sent, t1 received). Only the reading with the shortest round trip is kept, so a slow
// response never makes the ball jump; an old reading (> 60 s) may be replaced by any fresh one.
export type Clock = { offset: number; rtt: number; at: number };
export function updateClock(prev: Clock | null, serverNow: number, t0: number, t1: number): Clock {
  const sample = { offset: serverNow - (t0 + t1) / 2, rtt: t1 - t0, at: t1 };
  if (!prev) return sample;
  if (sample.rtt <= prev.rtt || t1 - prev.at > 60_000) return sample;
  return prev;
}

// A replay first seen late (the doorbell took a moment) starts from the beginning instead of jumping
// into the middle. Up to 1.5 s of delay is absorbed; the end position is the same on both screens.
export function replayDelay(firstSeenDbMs: number, startedMs: number): number {
  const late = firstSeenDbMs - startedMs;
  return late > 0 && late < 1500 ? late : 0;
}

// Slingshot: drag away from the ball, it flies the other way. Returns null for a tiny pull.
export function aimFromDrag(ball: { x: number; y: number }, pointer: { x: number; y: number }): { angle: number; power: number } | null {
  const dx = ball.x - pointer.x;
  const dy = ball.y - pointer.y;
  const power = Math.min(1, Math.hypot(dx, dy) / MAX_PULL);
  if (power < MIN_POWER) return null;
  return { angle: Math.atan2(dy, dx), power };
}

// The live counter: every stroke so far in this game (finished holes + this hole).
export function runningStrokes(ball: GolfBall): number {
  return ball.total + ball.strokes;
}

export function bestLine(best: Record<string, number>): string {
  const parts = HOLE_CHOICES.filter((n) => best[String(n)] !== undefined).map((n) => `${n}홀 ${best[String(n)]}타`);
  return parts.length ? `우리 최고 기록 (둘이 합친 타수): ${parts.join(" · ")}` : "아직 기록이 없어요. 한 판 끝내 보세요!";
}
