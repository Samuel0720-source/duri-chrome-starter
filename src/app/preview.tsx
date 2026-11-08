"use client";
import { useState, useEffect } from "react";
import { coupleCalendar, roomToday } from "../core/dates";
import { defaultZone, exampleStart, previewPath, readSelection, zones } from "../core/preview";

export function CalendarPreview({ initialToday, compact = false }: { initialToday: string; compact?: boolean }) {
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
  return (
    <div className="calendar-grid">
      {compact && (
        <a className="open-full" href={previewPath("/", start, zone)} target="_blank" rel="noopener noreferrer">
          전체 웹앱 열기 ↗
        </a>
      )}
      <section
        aria-label="기념일 계산 결과"
        className="sheet"
        aria-live="polite"
      >
        <div className="dateline">
          <span>오늘</span>
          <time dateTime={today}>{today.replaceAll("-", ". ")}</time>
        </div>
        {calendar?.status === "active" ? (
          <>
            <p className="caption">
              {calendar.milestoneToday ? "오늘은 우리의 기념일" : "함께한 지"}
            </p>
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
                  {calendar.daysUntilAnnual === 0
                    ? "오늘"
                    : "D−" + calendar.daysUntilAnnual}
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
      </section>
      <section className="settings">
        <h2>날짜 설정</h2>
        <label htmlFor="start">함께한 첫날</label>
        <input
          id="start"
          type="date"
          min="1900-01-01"
          max="9998-12-31"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <label htmlFor="zone">기준 시간대</label>
        <select
          id="zone"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
        >
          {zones.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
        <p className="hint">
          공개 미리보기예요. 날짜를 바꿔도 커플방에는 저장되지 않아요.
        </p>
      </section>
    </div>
  );
}
