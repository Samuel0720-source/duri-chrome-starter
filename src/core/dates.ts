const DAY_MS = 86_400_000;

function dayNumber(iso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso))
    throw new RangeError("YYYY-MM-DD 날짜를 입력해 주세요.");
  const ms = Date.parse(iso + "T00:00:00Z");
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== iso)
    throw new RangeError("달력에 있는 날짜를 입력해 주세요.");
  return ms / DAY_MS;
}

function dateAt(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function isCalendarDate(value: string): boolean {
  try {
    dayNumber(value);
    return true;
  } catch {
    return false;
  }
}

export function roomToday(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (part: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === part)!.value;
  return [get("year"), get("month"), get("day")].join("-");
}

function annualOccurrence(start: string, year: number): string {
  if (
    start.slice(5) === "02-29" &&
    new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1
  )
    return year + "-02-28";
  return year + start.slice(4);
}

export function coupleCalendar(start: string, today: string) {
  const s = dayNumber(start);
  const t = dayNumber(today);
  if (s > t) return { status: "upcoming" as const, daysToStart: s - t };
  const day = t - s + 1;
  const nextHundred = (Math.floor(day / 100) + 1) * 100;
  let year = Math.max(Number(today.slice(0, 4)), Number(start.slice(0, 4)) + 1);
  let annual = annualOccurrence(start, year);
  if (dayNumber(annual) < t) annual = annualOccurrence(start, ++year);
  return {
    status: "active" as const,
    day,
    milestoneToday: day % 100 === 0,
    nextHundred,
    daysUntilHundred: nextHundred - day,
    hundredDate: dateAt(s + nextHundred - 1),
    annual,
    daysUntilAnnual: dayNumber(annual) - t,
  };
}

export type Milestone = { label: string; date: string; daysLeft: number };

// Couple days that fall on the same date every year.
export const specialDays = [
  { label: "발렌타인데이", monthDay: "02-14" },
  { label: "화이트데이", monthDay: "03-14" },
  { label: "여자친구의 날", monthDay: "08-01" },
  { label: "남자친구의 날", monthDay: "10-03" },
  { label: "크리스마스", monthDay: "12-25" },
] as const;

// The next hundred-day mark and the next anniversary, plus any special day
// within the next 100 days, soonest first.
export function upcomingMilestones(start: string, today: string): Milestone[] {
  const s = dayNumber(start);
  const t = dayNumber(today);
  const items: Milestone[] = [];
  // Day 1 is the first day, so day k falls on s + k - 1.
  const k = Math.max(1, Math.ceil((t - s + 1) / 100)) * 100;
  items.push({ label: k.toLocaleString("ko-KR") + "일", date: dateAt(s + k - 1), daysLeft: s + k - 1 - t });
  const startYear = Number(start.slice(0, 4));
  for (let n = 1; ; n++) {
    const date = annualOccurrence(start, startYear + n);
    if (dayNumber(date) < t) continue;
    items.push({ label: n + "주년", date, daysLeft: dayNumber(date) - t });
    break;
  }
  const year = Number(today.slice(0, 4));
  for (const day of specialDays) {
    for (const y of [year, year + 1]) {
      const date = y + "-" + day.monthDay;
      const left = dayNumber(date) - t;
      if (left >= 0 && left <= 100) items.push({ label: day.label, date, daysLeft: left });
    }
  }
  return items.sort((a, b) => a.daysLeft - b.daysLeft);
}

// Whole calendar days from today to date (negative when date is past).
export function daysFrom(today: string, date: string): number {
  return dayNumber(date) - dayNumber(today);
}
