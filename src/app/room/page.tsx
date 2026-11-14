import { redirect } from "next/navigation";
import { coupleCalendar, daysFrom, roomToday, upcomingMilestones } from "../../core/dates";
import { MilestoneRail } from "../milestone-rail";
import { isMood } from "../../core/moods";
import { defaultZone, zones } from "../../core/preview";
import { getT } from "../../i18n/server";
import { serverClient } from "../../lib/supabase/server";
import { addPlan, createRoom, removePlan } from "./actions";
import { DeleteAccount } from "./delete-account";
import { RoomTabs } from "./room-tabs";
import { InviteBox } from "./invite-box";
import { RoomLive } from "./room-live";
import { RoomShell } from "./room-shell";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { t, locale } = await getT();
  const num = (n: number) => n.toLocaleString(locale === "ko" ? "ko-KR" : "en-CA");
  const supabase = await serverClient();
  if (!supabase) return <main className="wrap auth"><p>{t("common.configMissing")}</p></main>;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/room");
  const { error, left } = await searchParams;

  // Row level security returns only the caller's own seat and room.
  const { data: seat } = await supabase.from("couple_members").select("room_id").eq("user_id", auth.user.id).maybeSingle();

  if (!seat) {
    // Show "partner left" only for a recent notice, so an old breakup is not shown forever.
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: notice } = await supabase
      .from("room_notices").select("id").eq("kind", "partner_left").gte("created_at", since).limit(1).maybeSingle();
    return (
      <RoomShell wide={false}>
        {left && <p role="status" className="notice">{t("home.left")}</p>}
        {!left && notice && <p role="status" className="notice">{t("home.partnerLeft")}</p>}
        <section className="sheet">
          <h1>{t("home.create.title")}</h1>
          <form action={createRoom} className="stack">
            <label htmlFor="start">{t("settings.room.start")}</label>
            <input id="start" name="start" type="date" min="1900-01-01" max="9998-12-31" required />
            <label htmlFor="zone">{t("settings.room.zone")}</label>
            <select id="zone" name="zone" defaultValue={defaultZone}>
              {zones.map(({ value }) => <option key={value} value={value}>{t(`zone.${value}` as "zone.Asia/Seoul")}</option>)}
            </select>
            <button type="submit">{t("home.create.button")}</button>
          </form>
          {(error === "create" || error === "input") && <p role="alert" className="error">{t("home.create.failed")}</p>}
        </section>
        <DeleteAccount failed={error === "delete"} back="/room" />
      </RoomShell>
    );
  }

  const [{ data: room }, { count }, { data: plans }] = await Promise.all([
    supabase.from("couple_rooms").select("id, start_date, timezone, mood").eq("id", seat.room_id).maybeSingle(),
    supabase.from("couple_members").select("user_id", { count: "exact", head: true }).eq("room_id", seat.room_id),
    supabase.from("room_plans").select("id, on_date, title").eq("room_id", seat.room_id).order("on_date").order("created_at").limit(200),
  ]);
  if (!room) redirect("/room?error=closed");
  const today = roomToday(new Date(), room.timezone);
  const calendar = coupleCalendar(room.start_date, today);
  const full = (count ?? 0) >= 2;
  const mood = isMood(room.mood) ? room.mood : "berry";
  const upcoming = (plans ?? []).filter((p) => p.on_date >= today);
  const past = (plans ?? []).filter((p) => p.on_date < today).reverse();
  const next = upcoming[0];
  const dLabel = (date: string) => {
    const d = daysFrom(today, date);
    return d === 0 ? t("common.today") : t("common.dMinus", { n: num(d) });
  };

  return (
    <RoomShell>
      <div className="room" data-mood={mood}>
      <RoomLive roomId={room.id} />
      <RoomTabs active="home" />
      <div className="room-grid">
        <section className="sheet room-count" aria-label={t("home.room")}>
          <div className="dateline">
            <span>{t("common.today")}</span>
            <time dateTime={today}>{today.replaceAll("-", ". ")}</time>
          </div>
          <p className="caption">{calendar.status === "active" ? (calendar.milestoneToday ? t("home.milestoneToday") : t("home.together")) : t("home.untilStart")}</p>
          <div className="big">
            <strong>{calendar.status === "active" ? num(calendar.day) : t("common.dMinus", { n: calendar.daysToStart })}</strong>
            {calendar.status === "active" && <span>{t("home.dayUnit")}</span>}
          </div>
          <dl>
            <div>
              <dt>{t("home.nextDate")}</dt>
              <dd>
                {next ? dLabel(next.on_date) : t("home.noneYet")}
                <small>{next ? next.title : t("home.addBelow")}</small>
              </dd>
            </div>
            {calendar.status === "active" && (
              <div>
                <dt>{t("home.ourHundred", { n: num(calendar.nextHundred) })}</dt>
                <dd>
                  {t("common.dMinus", { n: num(calendar.daysUntilHundred) })}
                  <small>{calendar.hundredDate}</small>
                </dd>
              </div>
            )}
          </dl>
          <p className="hint">{full ? t("home.bothIn") : t("home.waiting")}</p>
        </section>

        <section className="plans" id="plans" aria-labelledby="plans-head">
          <h2 id="plans-head">{t("home.plans")}</h2>
          <form action={addPlan} className="plan-form">
            <input type="hidden" name="room" value={room.id} />
            <div className="field">
              <label htmlFor="plan-date">{t("home.planDate")}</label>
              <input id="plan-date" name="date" type="date" min="1900-01-01" max="9998-12-31" defaultValue={today} required />
            </div>
            <div className="field plan-title">
              <label htmlFor="plan-title">{t("home.planWhat")}</label>
              <input id="plan-title" name="title" type="text" maxLength={60} required placeholder={t("home.planExample")} />
            </div>
            <button type="submit">{t("home.planAdd")}</button>
          </form>
          {error === "plan" && <p role="alert" className="error">{t("home.planFailed")}</p>}
          {upcoming.length > 0 ? (
            <ol className="plan-list">
              {upcoming.map((p) => (
                <li key={p.id}>
                  <strong className="plan-d">{dLabel(p.on_date)}</strong>
                  <span className="plan-name">{p.title}</span>
                  <time dateTime={p.on_date}>{p.on_date.replaceAll("-", ". ")}</time>
                  <form action={removePlan}>
                    <input type="hidden" name="plan" value={p.id} />
                    <button type="submit" className="plan-remove" aria-label={t("home.planRemoveLabel", { title: p.title })}>{t("home.planRemove")}</button>
                  </form>
                </li>
              ))}
            </ol>
          ) : (
            <p className="hint">{t("home.noPlans")}</p>
          )}
          {past.length > 0 && (
            <details className="past-plans">
              <summary>{t("home.pastPlans", { n: past.length })}</summary>
              <ol className="plan-list">
                {past.map((p) => (
                  <li key={p.id}>
                    <span className="plan-name">{p.title}</span>
                    <time dateTime={p.on_date}>{p.on_date.replaceAll("-", ". ")}</time>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
      </div>
      <section className="room-milestones" aria-labelledby="room-milestones-head">
        <h2 id="room-milestones-head">{t("home.upcoming")}</h2>
        <MilestoneRail milestones={upcomingMilestones(room.start_date, today)} />
      </section>
      {!full && (
        <section className="settings">
          <h2>{t("home.invite")}</h2>
          <InviteBox roomId={room.id} />
        </section>
      )}
      <p className="hint"><a href="/room/settings">{t("home.settingsLink")}</a></p>
      </div>
    </RoomShell>
  );
}
