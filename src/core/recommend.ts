// "도우미" without any paid API: turns what the couple says ("10분, 경쟁은 싫어" / "10 min, no competition")
// into conditions, and picks from the activities that are really deployed. The AI step will read the same
// conditions later. Titles, descriptions and reasons are dictionary keys (helper.*), shown in any language.
import type { MessageKey } from "../i18n/dict.ts";

export type ActivityId = "guess" | "draw" | "gomoku" | "golf" | "watch";
export type Activity = {
  id: ActivityId;
  href: string;
  minMinutes: number;
  competitive: boolean; // a clock or a score to beat
};

// Only things that exist in the app today.
export const activities: readonly Activity[] = [
  { id: "guess", href: "/room/game", minMinutes: 5, competitive: false },
  { id: "draw", href: "/room/game?g=draw", minMinutes: 5, competitive: true },
  { id: "gomoku", href: "/room/game?g=gomoku", minMinutes: 10, competitive: true },
  { id: "golf", href: "/room/game?g=golf", minMinutes: 10, competitive: true },
  { id: "watch", href: "/room/watch", minMinutes: 15, competitive: false },
];

export type Conditions = { minutes: number | null; noCompetition: boolean; quiet: boolean };
export const noConditions: Conditions = { minutes: null, noCompetition: false, quiet: false };

// Reads one sentence (Korean or English). Only what it finds is changed, so later sentences add to earlier ones.
export function readConditions(text: string, before: Conditions = noConditions): Conditions {
  const next = { ...before };
  const lower = text.toLowerCase();
  const hours = /(\d+)\s*(시간|h\b|hrs?\b|hours?\b)/.exec(lower);
  const minutes = /(\d+)\s*(분|m\b|mins?\b|minutes?\b)/.exec(lower);
  if (hours) next.minutes = Number(hours[1]) * 60 + (minutes ? Number(minutes[1]) : 0);
  else if (minutes) next.minutes = Number(minutes[1]);
  if (/경쟁.{0,6}(싫|말고|없|빼|안)|이기고 지는.{0,6}(싫|없)|no compet|not compet|without compet|don'?t want to (compete|win)|no winn/.test(lower)) next.noCompetition = true;
  if (/말 ?안 ?해도|말없이|조용|말 ?하기 ?싫|quiet|no talking|without talking|don'?t want to talk|silent/.test(lower)) next.quiet = true;
  return next;
}

export type Phrase = { key: MessageKey; vars?: Record<string, number> };

export function describeConditions(c: Conditions): Phrase[] {
  const out: Phrase[] = [];
  if (c.minutes !== null) out.push(c.minutes >= 60 && c.minutes % 60 === 0 ? { key: "helper.hours", vars: { n: c.minutes / 60 } } : { key: "helper.minutes", vars: { n: c.minutes } });
  if (c.noCompetition) out.push({ key: "helper.noCompetition" });
  if (c.quiet) out.push({ key: "helper.quiet" });
  return out;
}

export type Pick = { activity: Activity; reasons: Phrase[] };

// Every activity that fits all conditions, with the reasons it fits. Nothing is invented: if none fits, the list is empty.
export function recommend(c: Conditions): Pick[] {
  const picks: Pick[] = [];
  for (const activity of activities) {
    if (c.minutes !== null && c.minutes < activity.minMinutes) continue;
    if (c.noCompetition && activity.competitive) continue;
    const reasons: Phrase[] = [];
    if (c.minutes !== null) reasons.push({ key: "helper.reason.minutes", vars: { n: activity.minMinutes } });
    if (c.noCompetition) reasons.push({ key: "helper.reason.noCompetition" });
    // Every activity today is typed, clicked, drawn or watched, so none needs talking.
    if (c.quiet) reasons.push({ key: "helper.reason.quiet" });
    picks.push({ activity, reasons });
  }
  return picks;
}
