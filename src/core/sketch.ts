// Collaborative shared drawing studio ("둘이 낙서장") shared across the web app (/room/draw)
// and the Chrome extension popup. Keep imports type-only so build-extension.mjs can transpile it cleanly.

export const SKETCH_W = 1000;
export const SKETCH_H = 750;

export const sketchColors = [
  "#2a1f26",
  "#6e304b",
  "#d6336c",
  "#e8590c",
  "#f2b705",
  "#2f9e44",
  "#1c7ed6",
  "#7048e8",
  "#8c7a76",
  "#ffffff",
] as const;

export const sketchWidths = [4, 9, 16, 26] as const;

export const sketchStamps = ["❤️", "⭐", "🌸", "✨", "🐾", "💌"] as const;

export const sketchBgs = ["paper", "blush", "mint", "night"] as const;
export type SketchBg = (typeof sketchBgs)[number];

export const sketchBgHex: Record<SketchBg, string> = {
  paper: "#fffdf8",
  blush: "#fdf0f2",
  mint: "#eef6ef",
  night: "#1e1926",
};

export type SketchPoint = [number, number];
export type SketchKind = "pen" | "erase" | "stamp";

export type SketchStrokeRow = {
  seq: number;
  stroke: string;
  segment: string;
  by: "me" | "partner";
  kind: SketchKind;
  color: string;
  width: number;
  points: SketchPoint[];
  stamp: string | null;
};

export type SketchState = {
  bg: SketchBg;
  revision: number;
  latestSeq: number;
  strokes: SketchStrokeRow[];
  hasExtensionToken?: boolean;
};

export function isSketchBg(value: unknown): value is SketchBg {
  return typeof value === "string" && (sketchBgs as readonly string[]).includes(value);
}

export function isSketchToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

export function isValidSketchStroke(
  kind: unknown,
  points: unknown,
  color: unknown,
  width: unknown,
  stamp: unknown,
): boolean {
  if (kind === "stamp") {
    return (
      typeof stamp === "string" &&
      (sketchStamps as readonly string[]).includes(stamp) &&
      typeof width === "number" &&
      Number.isInteger(width) &&
      width >= 16 &&
      width <= 80 &&
      Array.isArray(points) &&
      points.length === 1 &&
      Array.isArray(points[0]) &&
      points[0].length === 2 &&
      Number.isFinite(points[0][0]) &&
      Number.isFinite(points[0][1]) &&
      points[0][0] >= 0 &&
      points[0][0] <= SKETCH_W &&
      points[0][1] >= 0 &&
      points[0][1] <= SKETCH_H
    );
  }
  if (kind !== "pen" && kind !== "erase") return false;
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/.test(color)) return false;
  if (typeof width !== "number" || !Number.isInteger(width) || width < 1 || width > 48) return false;
  if (!Array.isArray(points) || points.length < 1 || points.length > 250) return false;
  return points.every(
    (p) =>
      Array.isArray(p) &&
      p.length === 2 &&
      Number.isFinite(p[0]) &&
      Number.isFinite(p[1]) &&
      p[0] >= 0 &&
      p[0] <= SKETCH_W &&
      p[1] >= 0 &&
      p[1] <= SKETCH_H,
  );
}

export type SketchPath = {
  id: string;
  kind: SketchKind;
  color: string;
  width: number;
  points: SketchPoint[];
  stamp: string | null;
};

export function groupSketchPaths(rows: SketchStrokeRow[]): SketchPath[] {
  const paths: SketchPath[] = [];
  for (const row of [...rows].sort((a, b) => a.seq - b.seq)) {
    const last = paths[paths.length - 1];
    if (row.kind !== "stamp" && last && last.id === row.stroke && last.kind === row.kind) {
      last.points.push(...row.points);
    } else {
      paths.push({
        id: row.stroke,
        kind: row.kind,
        color: row.color,
        width: row.width,
        points: [...row.points],
        stamp: row.stamp,
      });
    }
  }
  return paths;
}

// Quadratic Bezier midpoint smoothing so fast mouse/finger/stylus lines look fluid instead of polygonal.
export function drawSmoothPath(
  ctx: CanvasRenderingContext2D,
  pts: readonly SketchPoint[],
  color: string,
  width: number,
  erase = false,
): void {
  if (pts.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (pts.length === 2) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[1][0], pts[1][1]);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i][0] + pts[i + 1][0]) / 2;
    const midY = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last[0], last[1]);
  ctx.stroke();
  ctx.restore();
}

export function drawSketchStamp(
  ctx: CanvasRenderingContext2D,
  stamp: string,
  x: number,
  y: number,
  size: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(stamp, x, y);
  ctx.restore();
}

export function renderSketchScene(ctx: CanvasRenderingContext2D, paths: readonly SketchPath[]): void {
  ctx.clearRect(0, 0, SKETCH_W, SKETCH_H);
  for (const p of paths) {
    if (p.kind === "stamp" && p.stamp && p.points[0]) {
      drawSketchStamp(ctx, p.stamp, p.points[0][0], p.points[0][1], p.width);
    } else {
      drawSmoothPath(ctx, p.points, p.color, p.width, p.kind === "erase");
    }
  }
}
