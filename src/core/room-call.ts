import { isUuid } from "./album.ts";

export type Mode = "audio" | "video";
export type Kind = "ring" | "accept" | "busy" | "offer" | "answer" | "bye";
export type Signal = { id: string; sender: string; kind: Kind; detail: string };
export function isSignal(value: unknown): value is Signal {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<Signal>;
  if (!isUuid(s.id) || !isUuid(s.sender) || typeof s.detail !== "string") return false;
  if (s.kind === "ring") return s.detail === "audio" || s.detail === "video";
  if (s.kind === "offer" || s.kind === "answer") return s.detail.startsWith("v=0") && s.detail.length <= 24000;
  return (s.kind === "accept" || s.kind === "busy" || s.kind === "bye") && s.detail === "";
}
