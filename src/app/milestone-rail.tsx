import type { Milestone } from "../core/dates";

function dLabel(daysLeft: number) {
  return daysLeft === 0 ? "오늘" : "D−" + daysLeft.toLocaleString("ko-KR");
}

// The next hundred-day mark, the next anniversary and couple days within 100 days.
// Shared by the public home (live preview) and the couple's room (saved first day).
export function MilestoneRail({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) return null;
  return (
    <ol className="rail" tabIndex={0} aria-label="다가오는 기념일 목록">
      {milestones.map((m) => (
        <li key={m.label} className={m.daysLeft === 0 ? "is-today" : undefined}>
          <span className="rail-name">{m.label}</span>
          <strong className="rail-d">{dLabel(m.daysLeft)}</strong>
          <time dateTime={m.date}>{m.date.replaceAll("-", ". ")}</time>
        </li>
      ))}
    </ol>
  );
}
