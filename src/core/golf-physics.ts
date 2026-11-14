import type { GolfCourse, Point } from "./golf.ts";

// The same physics as duri_private.golf_simulate (supabase/migrations/202611130004_golf_v2.sql), step for step,
// so the browser can start rolling the ball the instant the finger lets go. The database's answer is still the
// truth: when it arrives it replaces this prediction (they match in practice; see the database test).
export function simulateShot(c: GolfCourse, x0: number, y0: number, ang: number, pw: number) {
  const r = 12;
  const segs = c.walls;
  let px = x0;
  let py = y0;
  let vx = Math.cos(ang) * pw * 28;
  let vy = Math.sin(ang) * pw * 28;
  const cx = c.cup.x, cy = c.cup.y, cr = c.cup.r;
  let t = 0;
  let holed = false;
  let wet = false;
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const path: Point[] = [[round1(x0), round1(y0)]];
  while (t < 600) {
    t++;
    for (let j = 1; j <= 3; j++) {
      px += vx / 3;
      py += vy / 3;
      for (const [ax, ay, bx, by] of segs) {
        const ex = bx - ax, ey = by - ay;
        const l2 = ex * ex + ey * ey;
        const u = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / l2));
        const qx = ax + u * ex, qy = ay + u * ey;
        const dx = px - qx, dy = py - qy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          const d = Math.sqrt(d2);
          let nx: number, ny: number;
          if (d < 1e-9) { nx = -ey / Math.sqrt(l2); ny = ex / Math.sqrt(l2); } else { nx = dx / d; ny = dy / d; }
          px = qx + nx * r;
          py = qy + ny * r;
          const dot = vx * nx + vy * ny;
          if (dot < 0) { vx -= 1.75 * dot * nx; vy -= 1.75 * dot * ny; }
        }
      }
      if ((px - cx) * (px - cx) + (py - cy) * (py - cy) < cr * cr && Math.sqrt(vx * vx + vy * vy) < 14) {
        holed = true; px = cx; py = cy; break;
      }
      for (const [x1, y1, x2, y2] of c.water) if (px > x1 && px < x2 && py > y1 && py < y2) wet = true;
      if (wet) break;
    }
    path.push([round1(px), round1(py)]);
    if (holed || wet) break;
    let fr = 0.985;
    for (const [x1, y1, x2, y2] of c.sand) if (px > x1 && px < x2 && py > y1 && py < y2) fr = 0.93;
    vx *= fr;
    vy *= fr;
    if (vx * vx + vy * vy < 0.04) break;
  }
  if (wet) { px = x0; py = y0; }
  return { path, x: px, y: py, holed, water: wet, ms: Math.round((t * 1000) / 60) };
}
