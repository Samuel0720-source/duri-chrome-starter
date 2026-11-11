"use client";
import { useState, useEffect, type ReactNode } from "react";
import { coupleCalendar, roomToday, upcomingMilestones } from "../core/dates";
import { defaultZone, exampleStart, previewPath, readSelection, zones } from "../core/preview";
import { MilestoneRail } from "./milestone-rail";

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
  return (
    <div className="counter" aria-label="기념일 계산 결과" aria-live="polite">
      <div className="dateline">
        <span>오늘</span>
        <time dateTime={today}>{today.replaceAll("-", ". ")}</time>
      </div>
      {calendar?.status === "active" ? (
        <>
          <p className="caption">{calendar.milestoneToday ? "오늘은 우리의 기념일" : "함께한 지"}</p>
          <div className="big">
            <strong>{calendar.day.toLocaleString("ko-KR")}</strong>
            <span>일째</span>
          </div>
          <dl>
            <div>
              <dt>우리의 {calendar.nextHundred}일</dt>
              <dd>
                D−{calendar.daysUntilHundred}
                <small>{calendar.hundredDate}</small>
              </dd>
            </div>
            <div>
              <dt>연애 기념일</dt>
              <dd>
                {calendar.daysUntilAnnual === 0 ? "오늘" : "D−" + calendar.daysUntilAnnual}
                <small>{calendar.annual}</small>
              </dd>
            </div>
          </dl>
        </>
      ) : calendar?.status === "upcoming" ? (
        <>
          <p className="caption">첫날까지</p>
          <div className="big">
            <strong>D−{calendar.daysToStart}</strong>
          </div>
        </>
      ) : (
        <p className="caption">시작일을 골라 주세요.</p>
      )}
    </div>
  );
}

function Fields({ start, setStart, zone, setZone }: Pick<Preview, "start" | "setStart" | "zone" | "setZone">) {
  return (
    <div className="fields">
      <div className="field">
        <label htmlFor="start">함께한 첫날</label>
        <input id="start" type="date" min="1900-01-01" max="9998-12-31" value={start} onChange={(e) => setStart(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="zone">기준 시간대</label>
        <select id="zone" value={zone} onChange={(e) => setZone(e.target.value)}>
          {zones.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
    </div>
  );
}

const hint = "공개 미리보기예요. 날짜를 바꿔도 커플방에는 저장되지 않아요.";

// The small window (/compact): counter and settings side by side, as before.
export function CalendarPreview({ initialToday, compact = false }: { initialToday: string; compact?: boolean }) {
  const p = usePreview(initialToday);
  return (
    <div className="calendar-grid">
      {compact && (
        <a className="open-full" href={previewPath("/", p.start, p.zone)} target="_blank" rel="noopener noreferrer">
          전체 웹앱 열기
        </a>
      )}
      <section className="sheet">
        <Counter today={p.today} calendar={p.calendar} />
      </section>
      <section className="settings">
        <h2>날짜 설정</h2>
        <Fields {...p} />
        <p className="hint">{hint}</p>
      </section>
    </div>
  );
}

// The home page: the hero's live counter, then the next anniversaries from the same date.
export function HomeLive({ initialToday, children }: { initialToday: string; children: ReactNode }) {
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
            <p className="hint">{hint}</p>
          </div>
        </div>
      </section>
      <section className="milestones" aria-labelledby="milestones-head">
        <div className="container">
          <div className="head-split">
            <h2 id="milestones-head">다가오는 기념일</h2>
            <p className="lead">다음 n00일과 주년, 100일 안에 오는 커플 데이를 보여요.</p>
          </div>
          <MilestoneRail milestones={milestones} />
        </div>
      </section>
    </>
  );
}
