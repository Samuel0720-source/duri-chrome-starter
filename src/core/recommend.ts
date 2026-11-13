// "도우미" without any paid API: turns what the couple says ("10분, 경쟁은 싫어") into conditions,
// and picks from the activities that are really deployed. The AI step will read the same conditions later.

export type Activity = {
  id: "guess" | "draw" | "watch";
  title: string;
  href: string;
  minMinutes: number;
  competitive: boolean; // a clock or a score to beat
  about: string;
};

// Only things that exist in the app today.
export const activities: readonly Activity[] = [
  { id: "guess", title: "상대 선택 맞히기", href: "/room/game", minMinutes: 5, competitive: false, about: "서로의 선택을 맞혀 보는 3라운드예요." },
  { id: "draw", title: "100초 그림 퀴즈", href: "/room/game?g=draw", minMinutes: 5, competitive: true, about: "한 명이 그리고 한 명이 100초 안에 맞혀요." },
  { id: "watch", title: "함께 보기", href: "/room/watch", minMinutes: 15, competitive: false, about: "같은 영상을 같은 장면으로 보면서 쉬어요." },
];

export type Conditions = { minutes: number | null; noCompetition: boolean; quiet: boolean };
export const noConditions: Conditions = { minutes: null, noCompetition: false, quiet: false };

// Reads one sentence. Only what it finds is changed, so later sentences add to earlier ones.
export function readConditions(text: string, before: Conditions = noConditions): Conditions {
  const next = { ...before };
  const hours = /(\d+)\s*시간/.exec(text);
  const minutes = /(\d+)\s*분/.exec(text);
  if (hours) next.minutes = Number(hours[1]) * 60 + (minutes ? Number(minutes[1]) : 0);
  else if (minutes) next.minutes = Number(minutes[1]);
  if (/경쟁.{0,6}(싫|말고|없|빼|안)|이기고 지는.{0,6}(싫|없)/.test(text)) next.noCompetition = true;
  if (/말 ?안 ?해도|말없이|조용|말 ?하기 ?싫/.test(text)) next.quiet = true;
  return next;
}

export function describeConditions(c: Conditions): string[] {
  const out: string[] = [];
  if (c.minutes !== null) out.push(c.minutes >= 60 && c.minutes % 60 === 0 ? `${c.minutes / 60}시간` : `${c.minutes}분`);
  if (c.noCompetition) out.push("경쟁은 싫어요");
  if (c.quiet) out.push("말 안 해도 되는 걸로");
  return out;
}

export type Pick = { activity: Activity; reasons: string[] };

// Every activity that fits all conditions, with the reasons it fits. Nothing is invented: if none fits, the list is empty.
export function recommend(c: Conditions): Pick[] {
  const picks: Pick[] = [];
  for (const activity of activities) {
    if (c.minutes !== null && c.minutes < activity.minMinutes) continue;
    if (c.noCompetition && activity.competitive) continue;
    const reasons: string[] = [];
    if (c.minutes !== null) reasons.push(`${activity.minMinutes}분 이상이면 할 수 있어요`);
    if (c.noCompetition) reasons.push("이기고 지는 게 없어요");
    // Every activity today is typed, clicked or watched, so none needs talking.
    if (c.quiet) reasons.push("말 없이 할 수 있어요");
    picks.push({ activity, reasons });
  }
  return picks;
}
