import { redirect } from "next/navigation";
import { coupleCalendar, roomToday } from "../../core/dates";
import { defaultZone, zones } from "../../core/preview";
import { serverClient } from "../../lib/supabase/server";
import { createRoom, signOut } from "./actions";
import { InviteBox } from "./invite-box";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="wrap auth">
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
  const { error } = await searchParams;

  // Row level security returns only the caller's own seat and room.
  const { data: seat } = await supabase.from("couple_members").select("room_id").eq("user_id", auth.user.id).maybeSingle();

  if (!seat) {
    return (
      <Shell>
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
          {error && <p role="alert" className="error">방을 만들지 못했어요. 날짜와 시간대를 확인해 주세요.</p>}
        </section>
      </Shell>
    );
  }

  const [{ data: room }, { count }] = await Promise.all([
    supabase.from("couple_rooms").select("id, start_date, timezone").eq("id", seat.room_id).maybeSingle(),
    supabase.from("couple_members").select("user_id", { count: "exact", head: true }).eq("room_id", seat.room_id),
  ]);
  if (!room) redirect("/room?error=closed");
  const calendar = coupleCalendar(room.start_date, roomToday(new Date(), room.timezone));
  const full = (count ?? 0) >= 2;

  return (
    <Shell>
      <section className="sheet" aria-label="우리 방">
        <p className="caption">{calendar.status === "active" ? "함께한 지" : "첫날까지"}</p>
        <div className="big">
          <strong>{calendar.status === "active" ? calendar.day.toLocaleString("ko-KR") : "D−" + calendar.daysToStart}</strong>
          {calendar.status === "active" && <span>일째</span>}
        </div>
        <p className="hint">{full ? "두 사람이 모두 들어왔어요." : "아직 상대가 들어오지 않았어요."}</p>
      </section>
      {!full && (
        <section className="settings">
          <h2>상대 초대하기</h2>
          <InviteBox roomId={room.id} />
        </section>
      )}
    </Shell>
  );
}
