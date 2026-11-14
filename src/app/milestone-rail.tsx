"use client";

import type { Milestone } from "../core/dates";
import { useT } from "../i18n/client";

// The next hundred-day mark, the next anniversary and couple days within 100 days.
// Shared by the public home (live preview) and the couple's room (saved first day).
export function MilestoneRail({ milestones }: { milestones: Milestone[] }) {
  const { t, locale } = useT();
  if (milestones.length === 0) return null;
  const num = (n: number) => n.toLocaleString(locale === "ko" ? "ko-KR" : "en-CA");
  return (
    <ol className="rail" tabIndex={0} aria-label={t("ms.list")}>
      {milestones.map((m) => (
        <li key={m.kind + m.date} className={m.daysLeft === 0 ? "is-today" : undefined}>
          <span className="rail-name">{t(`ms.${m.kind}`, { n: num(m.n ?? 0) })}</span>
          <strong className="rail-d">{m.daysLeft === 0 ? t("common.today") : t("common.dMinus", { n: num(m.daysLeft) })}</strong>
          <time dateTime={m.date}>{m.date.replaceAll("-", ". ")}</time>
        </li>
      ))}
    </ol>
  );
}
