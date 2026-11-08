import { CalendarPreview } from "../preview";
import { roomToday } from "../../core/dates";
import { defaultZone } from "../../core/preview";

export const dynamic = "force-dynamic";

export default function CompactPage() {
  return (
    <main className="wrap compact">
      <header className="top">
        <div className="brand">
          <img alt="" width="32" height="32" src="/icons/icon-192.png" />
          둘이
        </div>
        <h1>기념일 미니 창</h1>
      </header>
      <CalendarPreview compact initialToday={roomToday(new Date(), defaultZone)} />
    </main>
  );
}
