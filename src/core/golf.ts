// 미니골프 types and small pure helpers. The physics (one roll per shot) runs in the database;
// the browser only replays the stored path and turns a finger drag into an angle and a power.
export type Point = [number, number];
export type GolfBall = {
  x: number;
  y: number;
  strokes: number;
  total: number;
  holed: boolean;
  shotNo: number;
  startedMs: number | null;
  untilMs: number;
  path: Point[] | null;
};
export type GolfCourse = {
  w: number;
  h: number;
  ball: number;
  tee: Point;
  cup: { x: number; y: number; r: number };
  walls: [number, number, number, number][];
};
export type GolfState =
  | { game: null; best: Record<string, number>; nowMs: number }
  | {
      game: string;
      holes: 1 | 3;
      hole: number;
      status: "open" | "done" | "cancelled";
      course: GolfCourse;
      me: GolfBall;
      partner: GolfBall;
      best: Record<string, number>;
      nowMs: number;
    };

export const MAX_PULL = 180; // logical px of drag that means full power
export const MIN_POWER = 0.05;

// Where a ball is at `now` (database clock, ms). Everyone replays the same stored path on the same clock.
export function ballAt(ball: GolfBall, now: number): { x: number; y: number; moving: boolean } {
  const path = ball.path;
  if (!path || path.length < 2 || ball.startedMs === null) return { x: ball.x, y: ball.y, moving: false };
  const duration = Math.max(1, ball.untilMs - ball.startedMs);
  const elapsed = now - ball.startedMs;
  if (elapsed >= duration) return { x: ball.x, y: ball.y, moving: false };
  if (elapsed <= 0) return { x: path[0][0], y: path[0][1], moving: true };
  const f = (elapsed / duration) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(f));
  const t = f - i;
  return { x: path[i][0] + (path[i + 1][0] - path[i][0]) * t, y: path[i][1] + (path[i + 1][1] - path[i][1]) * t, moving: true };
}

// Slingshot: drag away from the ball, it flies the other way. Returns null for a tiny pull.
export function aimFromDrag(ball: { x: number; y: number }, pointer: { x: number; y: number }): { angle: number; power: number } | null {
  const dx = ball.x - pointer.x;
  const dy = ball.y - pointer.y;
  const pull = Math.hypot(dx, dy);
  const power = Math.min(1, pull / MAX_PULL);
  if (power < MIN_POWER) return null;
  return { angle: Math.atan2(dy, dx), power };
}

// Button controls (accessible alternative): degrees clockwise from "right", percent 5..100.
export function aimFromButtons(degrees: number, percent: number): { angle: number; power: number } {
  return { angle: (degrees * Math.PI) / 180, power: Math.min(1, Math.max(MIN_POWER, percent / 100)) };
}

export function bestLine(best: Record<string, number>): string {
  const one = best["1"];
  const three = best["3"];
  const parts: string[] = [];
  if (one !== undefined) parts.push(`1홀 최고 ${one}타`);
  if (three !== undefined) parts.push(`3홀 최고 ${three}타`);
  return parts.length ? `우리의 기록: ${parts.join(", ")}` : "아직 기록이 없어요. 한 판 끝내 보세요!";
}

export function ballLine(ball: GolfBall, now: number): string {
  if (ball.holed) return `${ball.strokes}타로 컵인`;
  if (ballAt(ball, now).moving) return `${ball.strokes}타, 굴러가는 중`;
  return `${ball.strokes}타`;
}
