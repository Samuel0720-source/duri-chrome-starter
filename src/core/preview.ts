import { isCalendarDate } from "./dates.ts";

export const exampleStart = "2026-08-13";
export const defaultZone = "America/Vancouver";

// Any real IANA zone ("America/Toronto", "Asia/Seoul"); the database checks it again.
export function isZone(zone: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+)*$/.test(zone)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
}

export type Selection = { start: string; zone: string };

export function isPreviewStart(start: string): boolean {
  return start >= "1900-01-01" && start <= "9998-12-31" && isCalendarDate(start);
}

export function readSelection(hash: string): Selection | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const start = params.get("start") ?? "";
  const zone = params.get("zone") ?? "";
  if (!isPreviewStart(start) || !isZone(zone)) return null;
  return { start, zone };
}

// The two fields describe the public calculator. Never include a room or invite token here.
export function previewPath(path: "/" | "/compact", start: string, zone: string): string {
  const fields = new URLSearchParams({ start, zone }).toString();
  return readSelection(fields) ? path + "#" + fields : path;
}
