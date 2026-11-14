"use client";
import { useState, useEffect, type ReactNode } from "react";
import { coupleCalendar, roomToday, upcomingMilestones } from "../core/dates";
import { defaultZone, exampleStart, previewPath, readSelection, zones } from "../core/preview";
import { MilestoneRail } from "./milestone-rail";
import { useT } from "../i18n/client";

// The public calculator's state: first day, time zone and "today" in that zone.
function usePreview(initialToday: string) {
  const [start, setStart] = useState(exampleStart);
  const [zone, setZone] = useState(defaultZone);
  const [today, setToday] = useState(initialToday);
  useEffect(() => {
    const restore = () => {
      const selection = readSelection(window.location.hash);
      if (!selection) return;
      setStart(selection.start);
      setZone(selection.zone);
    };
    restore();
    window.addEventListener("hashchange", restore);
    return () => window.removeEventListener("hashchange", restore);
  }, []);
  useEffect(() => {
    const refresh = () => setToday(roomToday(new Date(), zone));
    refresh();
    const timer = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [zone]);
  let calendar: ReturnType<typeof coupleCalendar> | undefined;
  try {
    calendar = coupleCalendar(start, today);
  } catch {
    /* Input is empty or incomplete while editing. */
  }
  return { start, setStart, zone, setZone, today, calendar };
}
type Preview = ReturnType<typeof usePreview>;

function Counter({ today, calendar }: Pick<Preview, "today" | "calendar">) {
  const { t, locale } = useT();
  const num = (n: number) => n.toLocaleString(locale === "ko" ? "ko-KR" : "en-CA");
  return (
    <div className="counter" aria-label={t("preview.result")} aria-live="polite">
      <div className="dateline">
        <span>{t("common.today")}</span>
        <time dateTime={today}>{today.replaceAll("-", ". ")}</time>
      </div>
      {calendar?.status === "active" ? (
        <>
          <p className="caption">{calendar.milestoneToday ? t("home.milestoneToday") : t("home.together")}</p>
          <div className="big">
            <strong>{num(calendar.day)}</strong>
            <span>{t("home.dayUnit")}</span>
          </div>
          <dl>
            <div>
              <dt>{t("home.ourHundred", { n: num(calendar.nextHundred) })}</dt>
              <dd>
                {t("common.dMinus", { n: num(calendar.daysUntilHundred) })}
                <small>{calendar.hundredDate}</small>
              </dd>
            </div>
            <div>
              <dt>{t("home.annual")}</dt>
              <dd>
                {calendar.daysUntilAnnual === 0 ? t("common.today") : t("common.dMinus", { n: num(calendar.daysUntilAnnual) })}
                <small>{calendar.annual}</small>
              </dd>
            </div>
          </dl>
        </>
      ) : calendar?.status === "upcoming" ? (
        <>
          <p className="caption">{t("home.untilStart")}</p>
          <div className="big">
            <strong>{t("common.dMinus", { n: calendar.daysToStart })}</strong>
          </div>
        </>
      ) : (
        <p className="caption">{t("preview.pickStart")}</p>
      )}
    </div>
  );
}

function Fields({ start, setStart, zone, setZone }: Pick<Preview, "start" | "setStart" | "zone" | "setZone">) {
  const { t } = useT();
  return (
    <div className="fields">
      <div className="field">
        <label htmlFor="start">{t("settings.room.start")}</label>
        <input id="start" type="date" min="1900-01-01" max="9998-12-31" value={start} onChange={(e) => setStart(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="zone">{t("settings.room.zone")}</label>
        <select id="zone" value={zone} onChange={(e) => setZone(e.target.value)}>
          {zones.map(({ value }) => <option key={value} value={value}>{t(`zone.${value}` as "zone.Asia/Seoul")}</option>)}
        </select>
      </div>
    </div>
  );
}


// The small window (/compact): counter and settings side by side, as before.
export function CalendarPreview({ initialToday, compact = false }: { initialToday: string; compact?: boolean }) {
  const { t } = useT();
  const p = usePreview(initialToday);
  return (
    <div className="calendar-grid">
      {compact && (
        <a className="open-full" href={previewPath("/", p.start, p.zone)} target="_blank" rel="noopener noreferrer">
          {t("preview.openFull")}
        </a>
      )}
      <section className="sheet">
        <Counter today={p.today} calendar={p.calendar} />
      </section>
      <section className="settings">
        <h2>{t("preview.dateSettings")}</h2>
        <Fields {...p} />
        <p className="hint">{t("preview.hint")}</p>
      </section>
    </div>
  );
}

// The home page: the hero's live counter, then the next anniversaries from the same date.
export function HomeLive({ initialToday, children }: { initialToday: string; children: ReactNode }) {
  const { t } = useT();
  const p = usePreview(initialToday);
  let milestones: ReturnType<typeof upcomingMilestones> = [];
  try {
    milestones = upcomingMilestones(p.start, p.today);
  } catch {
    /* Same as above: wait for a complete date. */
  }
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-text">{children}</div>
          <div className="sheet hero-card">
            <Counter today={p.today} calendar={p.calendar} />
            <Fields {...p} />
            <p className="hint">{t("preview.hint")}</p>
          </div>
        </div>
      </section>
      <section className="milestones" aria-labelledby="milestones-head">
        <div className="container">
          <div className="head-split">
            <h2 id="milestones-head">{t("home.upcoming")}</h2>
            <p className="lead">{t("landing.upcomingLead")}</p>
          </div>
          <MilestoneRail milestones={milestones} />
        </div>
      </section>
    </>
  );
}
