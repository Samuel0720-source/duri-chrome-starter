import { CalendarPreview } from "../preview";
import { roomToday } from "../../core/dates";
import { defaultZone } from "../../core/preview";
import { getT } from "../../i18n/server";

export const dynamic = "force-dynamic";

export default async function CompactPage() {
  const { t } = await getT();
  return (
    <main className="wrap compact">
      <header className="top">
        <div className="brand">
          <img alt="" width="32" height="32" src="/icons/icon-192.png" />
          {t("app.name")}
        </div>
        <h1>{t("compact.title")}</h1>
      </header>
      <CalendarPreview compact initialToday={roomToday(new Date(), defaultZone)} />
    </main>
  );
}
