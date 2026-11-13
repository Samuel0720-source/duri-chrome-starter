// "100초 그림 퀴즈" shared types and small pure helpers.
// The word bank is NOT here: it lives only in the database (duri_private.draw_word_bank),
// so the browser bundle never contains the list of possible answers.

export const drawCategories = [
  { value: "food", label: "음식" },
  { value: "animal", label: "동물" },
  { value: "thing", label: "사물" },
  { value: "place", label: "장소" },
  { value: "date", label: "데이트 활동" },
  { value: "mix", label: "전부 섞기" },
] as const;
export type DrawCategory = (typeof drawCategories)[number]["value"];

export function categoryLabel(value: string): string {
  return drawCategories.find((c) => c.value === value)?.label ?? value;
}

export const DRAW_SECONDS = 100;
// The board is 1000 wide and 750 tall; strokes are stored in these units so every screen size matches.
export const BOARD_W = 1000;
export const BOARD_H = 750;

// Best number of words solved in 100 seconds, per category.
export type DrawRecords = Partial<Record<DrawCategory, number>>;
export type DrawWord = { n: number; word: string; outcome: "correct" | "pass" | null };
export type DrawState =
  | { game: null; nowMs: number; records: DrawRecords }
  | {
      game: string;
      category: DrawCategory;
      role: "drawer" | "guesser";
      phase: "lobby" | "live" | "done";
      meReady: boolean;
      partnerReady: boolean;
      nowMs: number;
      startedMs: number | null;
      deadlineMs: number | null;
      result: "won" | "timeout" | null;
      score: number;
      passes: number;
      wordNo: number;
      word: string | null; // the current word, for the drawer only
      words: DrawWord[]; // earlier words (both see them); every word once the round is over
      records: DrawRecords;
    };

export function recordText(value: number | undefined): string {
  return value === undefined ? "없음" : `${value}개`;
}

export type Point = [number, number];
export type Stroke = { seq: number; stroke: string; segment?: string; color: string; width: number; points: Point[] };
export type DrawGuess = { id: number; player: string; guess: string; correct: boolean };

export const penColors = ["#2a1f26", "#d6336c", "#e8590c", "#f2b705", "#2f9e44", "#1c7ed6", "#7048e8"] as const;
export const penWidths = [
  { value: 4, label: "가늘게" },
  { value: 10, label: "보통" },
  { value: 22, label: "굵게" },
] as const;

// Difference between the database clock and this device's clock. Both screens count down
// against the database's deadline, so a wrong device clock cannot add or remove time.
export function clockOffset(serverNowMs: number, deviceNowMs: number): number {
  return serverNowMs - deviceNowMs;
}

// Whole seconds left (rounded up so "0" only shows when time is truly over).
export function secondsLeft(deadlineMs: number, deviceNowMs: number, offsetMs: number): number {
  const left = deadlineMs - (deviceNowMs + offsetMs);
  return Math.max(0, Math.ceil(left / 1000));
}

// Share of the 100 seconds still left, 0 to 1, for the progress bar.
export function timeShare(deadlineMs: number, deviceNowMs: number, offsetMs: number): number {
  const left = deadlineMs - (deviceNowMs + offsetMs);
  return Math.min(1, Math.max(0, left / (DRAW_SECONDS * 1000)));
}

// Groups stored segments back into whole strokes (a stroke may arrive in several segments).
export function strokesToPaths(rows: Stroke[]): { color: string; width: number; points: Point[] }[] {
  const paths: { id: string; color: string; width: number; points: Point[] }[] = [];
  for (const row of [...rows].sort((a, b) => a.seq - b.seq)) {
    const last = paths[paths.length - 1];
    if (last && last.id === row.stroke) last.points.push(...row.points);
    else paths.push({ id: row.stroke, color: row.color, width: row.width, points: [...row.points] });
  }
  return paths.map(({ color, width, points }) => ({ color, width, points }));
}

// Checks the same rules the database enforces, so the pen never sends a stroke the server will refuse.
export function isValidSegment(points: Point[], color: string, width: number): boolean {
  return (
    /^#[0-9a-f]{6}$/.test(color) &&
    Number.isInteger(width) &&
    width >= 1 &&
    width <= 40 &&
    points.length >= 1 &&
    points.length <= 250 &&
    points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1000 && y >= 0 && y <= 1000)
  );
}

export function formatSeconds(value: number): string {
  return (Math.round(value * 10) / 10).toString() + "초";
}
