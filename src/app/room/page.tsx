import { redirect } from "next/navigation";
import { coupleCalendar, daysFrom, roomToday } from "../../core/dates";
import { isMood } from "../../core/moods";
import { defaultZone, zones } from "../../core/preview";
import { serverClient } from "../../lib/supabase/server";
import { addPlan, createRoom, deleteAccount, leaveRoom, removePlan, setStart, signOut } from "./actions";
import { MoodPicker } from "./mood-picker";
import { RoomTabs } from "./room-tabs";
import { InviteBox } from "./invite-box";
import { RoomLive } from "./room-live";

export const dynamic = "force-dynamic";

function DeleteAccount({ failed }: { failed: boolean }) {
  return (
    <details className="leave" open={failed}>
      <summary>계정 삭제</summary>
      <form action={deleteAccount} className="stack">
        <p className="hint">내 계정과 로그인 정보, 우리 방이 모두 지워져요. 상대에게는 “상대가 방을 나갔어요”만 보여요. 되돌릴 수 없어요.</p>
        <label className="check">
          <input type="checkbox" name="confirm" value="yes" required /> 네, 내 계정을 지울게요
        </label>
        <button type="submit" className="danger">계정 삭제</button>
      </form>
      {failed && <p role="alert" className="error">계정을 지우지 못했어요. 다시 시도해 주세요.</p>}
    </details>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={wide ? "wrap room-wrap" : "wrap auth"}>
      <header className="top">
        <div className="brand">
          <img alt="" width="32" height="32" src="/icons/icon-192.png" />
          둘이
        </div>
        <form action={signOut}>
          <button type="submit" className="link">로그아웃</button>
        </form>
      </header>
      {children}
    </main>
  );
}

export default async function RoomPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const supabase = await serverClient();
  if (!supabase) return <main className="wrap auth"><p>로그인 설정이 아직 연결되지 않았어요.</p></main>;
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
      <Shell>
        {left && <p role="status" className="notice">방에서 나왔어요.</p>}
        {!left && notice && <p role="status" className="notice">상대가 방을 나갔어요. 새 방을 만들 수 있어요.</p>}
        <section className="sheet">
          <h1>우리 방 만들기</h1>
          <form action={createRoom} className="stack">
            <label htmlFor="start">함께한 첫날</label>
            <input id="start" name="start" type="date" min="1900-01-01" max="9998-12-31" required />
            <label htmlFor="zone">기준 시간대</label>
            <select id="zone" name="zone" defaultValue={defaultZone}>
              {zones.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="submit">방 만들기</button>
          </form>
          {(error === "create" || error === "input") && <p role="alert" className="error">방을 만들지 못했어요. 날짜와 시간대를 확인해 주세요.</p>}
        </section>
        <DeleteAccount failed={error === "delete"} />
      </Shell>
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
    return d === 0 ? "오늘" : "D−" + d.toLocaleString("ko-KR");
  };

  return (
    <Shell wide>
      <div className="room" data-mood={mood}>
      <RoomLive roomId={room.id} />
      <RoomTabs active="home" />
      <div className="room-grid">
        <section className="sheet room-count" aria-label="우리 방">
          <div className="dateline">
            <span>오늘</span>
            <time dateTime={today}>{today.replaceAll("-", ". ")}</time>
          </div>
          <p className="caption">{calendar.status === "active" ? (calendar.milestoneToday ? "오늘은 우리의 기념일" : "함께한 지") : "첫날까지"}</p>
          <div className="big">
            <strong>{calendar.status === "active" ? calendar.day.toLocaleString("ko-KR") : "D−" + calendar.daysToStart}</strong>
            {calendar.status === "active" && <span>일째</span>}
          </div>
          <dl>
            <div>
              <dt>다음 만남</dt>
              <dd>
                {next ? dLabel(next.on_date) : "아직 없어요"}
                <small>{next ? next.title : "아래에 약속을 적어 보세요"}</small>
              </dd>
            </div>
            {calendar.status === "active" && (
              <div>
                <dt>우리의 {calendar.nextHundred}일</dt>
                <dd>
                  D−{calendar.daysUntilHundred}
                  <small>{calendar.hundredDate}</small>
                </dd>
              </div>
            )}
          </dl>
          <p className="hint">{full ? "두 사람이 모두 들어왔어요." : "아직 상대가 들어오지 않았어요."}</p>
        </section>

        <section className="plans" id="plans" aria-labelledby="plans-head">
          <h2 id="plans-head">우리 약속</h2>
          <form action={addPlan} className="plan-form">
            <input type="hidden" name="room" value={room.id} />
            <div className="field">
              <label htmlFor="plan-date">날짜</label>
              <input id="plan-date" name="date" type="date" min="1900-01-01" max="9998-12-31" defaultValue={today} required />
            </div>
            <div className="field plan-title">
              <label htmlFor="plan-title">무엇을 할까요</label>
              <input id="plan-title" name="title" type="text" maxLength={60} required placeholder="예: 한강 피크닉" />
            </div>
            <button type="submit">약속 추가</button>
          </form>
          {error === "plan" && <p role="alert" className="error">약속을 저장하지 못했어요. 날짜와 1~60자 이름을 확인해 주세요.</p>}
          {upcoming.length > 0 ? (
            <ol className="plan-list">
              {upcoming.map((p) => (
                <li key={p.id}>
                  <strong className="plan-d">{dLabel(p.on_date)}</strong>
                  <span className="plan-name">{p.title}</span>
                  <time dateTime={p.on_date}>{p.on_date.replaceAll("-", ". ")}</time>
                  <form action={removePlan}>
                    <input type="hidden" name="plan" value={p.id} />
                    <button type="submit" className="plan-remove" aria-label={p.title + " 약속 지우기"}>지우기</button>
                  </form>
                </li>
              ))}
            </ol>
          ) : (
            <p className="hint">다가오는 약속이 없어요. 두 사람 모두에게 바로 보여요.</p>
          )}
          {past.length > 0 && (
            <details className="past-plans">
              <summary>지난 약속 {past.length}개</summary>
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
      {!full && (
        <section className="settings">
          <h2>상대 초대하기</h2>
          <InviteBox roomId={room.id} />
        </section>
      )}
      <details className="leave room-settings" open={error === "mood" || error === "start"}>
        <summary>방 설정</summary>
        <MoodPicker key={mood} roomId={room.id} current={mood} />
        <form action={setStart} className="stack start-form">
          <input type="hidden" name="room" value={room.id} />
          <div className="fields">
            <div className="field">
              <label htmlFor="room-start">함께한 첫날</label>
              <input id="room-start" name="start" type="date" min="1900-01-01" max="9998-12-31" defaultValue={room.start_date} required />
            </div>
            <div className="field">
              <label htmlFor="room-zone">기준 시간대</label>
              <select id="room-zone" name="zone" defaultValue={room.timezone}>
                {zones.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="secondary">날짜 저장</button>
        </form>
        {(error === "mood" || error === "start") && <p role="alert" className="error">저장하지 못했어요. 다시 시도해 주세요.</p>}
      </details>
      <details className="leave" open={error === "leave" || error === "confirm"}>
        <summary>방 나가기</summary>
        <form action={leaveRoom} className="stack">
          <input type="hidden" name="room" value={room.id} />
          <p className="hint">방을 나가면 두 사람 모두 이 방에서 빠지고, 방은 닫혀요. 되돌릴 수 없어요.</p>
          <label className="check">
            <input type="checkbox" name="confirm" value="yes" required /> 네, 방을 닫고 나갈게요
          </label>
          <button type="submit" className="danger">방 나가기</button>
        </form>
        {(error === "leave" || error === "confirm") && <p role="alert" className="error">방을 나가지 못했어요. 다시 시도해 주세요.</p>}
      </details>
      <DeleteAccount failed={error === "delete"} />
      </div>
    </Shell>
  );
}
