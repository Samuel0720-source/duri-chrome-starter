import { CalendarPreview } from "./preview";
import { InstallControl } from "./install";
import { roomToday } from "../core/dates";
import { defaultZone } from "../core/preview";

export const dynamic = "force-dynamic";
export default function Home() {
  return (
    <main className="wrap">
      <header className="top">
        <div className="brand">
          <img alt="" width="36" height="36" src="/icons/icon-192.png" />
          둘이
        </div>
        <InstallControl />
      </header>
      <div className="intro">
        <h1>우리 기념일</h1>
        <p>함께한 첫날을 고르면 다음 기념일이 보여요.</p>
      </div>
      <CalendarPreview
        initialToday={roomToday(new Date(), defaultZone)}
      />
    </main>
  );
}
