import { redirect } from "next/navigation";
import { isMood } from "../../../core/moods";
import { zones } from "../../../core/preview";
import { getT } from "../../../i18n/server";
import { serverClient } from "../../../lib/supabase/server";
import { roomNames } from "../../../lib/room-names";
import { LanguageForm } from "../../language-form";
import { leaveRoom, setNickname, setStart, signOut } from "../actions";
import { DeleteAccount } from "../delete-account";
import { MoodPicker } from "../mood-picker";
import { RoomLive } from "../room-live";
import { RoomTabs } from "../room-tabs";
import { RoomShell } from "../room-shell";

export const dynamic = "force-dynamic";

const guide = ["start", "home", "games", "golf", "watch", "chat", "settings", "install"] as const;

// Settings: language, nicknames, room theme and first day, a short guide, and the account.
export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { t, locale } = await getT();
  const supabase = await serverClient();
  if (!supabase) return <main className="wrap auth"><p>{t("common.configMissing")}</p></main>;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/room/settings");
  const { error, saved } = await searchParams;
  const { data: seat } = await supabase.from("couple_members").select("room_id").eq("user_id", auth.user.id).maybeSingle();
  if (!seat) redirect("/room");
  const [{ data: room }, { count }, names] = await Promise.all([
    supabase.from("couple_rooms").select("id, start_date, timezone, mood").eq("id", seat.room_id).maybeSingle(),
    supabase.from("couple_members").select("user_id", { count: "exact", head: true }).eq("room_id", seat.room_id),
    roomNames(supabase, seat.room_id, auth.user.id),
  ]);
  if (!room) redirect("/room");
  const mood = isMood(room.mood) ? room.mood : "berry";
  const full = (count ?? 0) >= 2;

  return (
    <RoomShell>
      <div className="room" data-mood={mood}>
        <RoomLive roomId={room.id} />
        <RoomTabs active="settings" />
        <h1 className="settings-title">{t("settings.title")}</h1>
        <div className="settings-stack">
          <section className="sheet" id="language" aria-labelledby="lang-head">
            <h2 id="lang-head">{t("settings.lang.title")} · Language</h2>
            <p className="hint">{t("settings.lang.hint")}</p>
            <LanguageForm current={locale} back="/room/settings#language" label={t("settings.lang.title")} button={t("settings.lang.apply")} />
          </section>

          <section className="sheet" id="nick" aria-labelledby="nick-head">
            <h2 id="nick-head">{t("settings.nick.title")}</h2>
            {full ? (
              <>
                <form action={setNickname} className="stack">
                  <input type="hidden" name="room" value={room.id} />
                  <label htmlFor="nick-input">{t("settings.nick.label")}</label>
                  <div className="inline-field">
                    <input id="nick-input" name="nick" type="text" maxLength={20} defaultValue={names.partnerNick ?? ""} placeholder={t("settings.nick.placeholder")} />
                    <button type="submit">{t("common.save")}</button>
                  </div>
                </form>
                <p className="hint">{t("settings.nick.hint")}</p>
                <p className="nick-theirs" data-testid="nick-theirs">{names.myNick ? t("settings.nick.theirs", { name: names.myNick }) : t("settings.nick.theirsNone")}</p>
              </>
            ) : (
              <p className="hint">{t("settings.nick.needPartner")}</p>
            )}
            {saved === "nick" && <p role="status" className="hit">{t("common.saved")}</p>}
            {error === "nick" && <p role="alert" className="error">{t("settings.nick.invalid")}</p>}
          </section>

          <section className="sheet room-settings" id="room" aria-labelledby="room-head">
            <h2 id="room-head">{t("settings.room.title")}</h2>
            <MoodPicker key={mood} roomId={room.id} current={mood} />
            <form action={setStart} className="stack start-form">
              <input type="hidden" name="room" value={room.id} />
              <div className="fields">
                <div className="field">
                  <label htmlFor="room-start">{t("settings.room.start")}</label>
                  <input id="room-start" name="start" type="date" min="1900-01-01" max="9998-12-31" defaultValue={room.start_date} required />
                </div>
                <div className="field">
                  <label htmlFor="room-zone">{t("settings.room.zone")}</label>
                  <select id="room-zone" name="zone" defaultValue={room.timezone}>
                    {zones.map(({ value }) => <option key={value} value={value}>{t(`zone.${value}` as "zone.Asia/Seoul")}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" className="secondary">{t("settings.room.saveDate")}</button>
            </form>
            {saved === "room" && <p role="status" className="hit">{t("common.saved")}</p>}
            {error === "room" && <p role="alert" className="error">{t("common.saveFailed")}</p>}
          </section>

          <section className="sheet guide" id="guide" aria-labelledby="guide-head">
            <h2 id="guide-head">{t("settings.guide.title")}</h2>
            {guide.map((g) => (
              <details key={g}>
                <summary>{t(`guide.${g}.title`)}</summary>
                <p>{t(`guide.${g}.body`)}</p>
              </details>
            ))}
          </section>

          <section className="sheet" id="account" aria-labelledby="account-head">
            <h2 id="account-head">{t("settings.account.title")}</h2>
            <form action={signOut}>
              <button type="submit" className="secondary">{t("common.signOut")}</button>
            </form>
            <details className="leave" open={error === "leave"}>
              <summary>{t("settings.leave.title")}</summary>
              <form action={leaveRoom} className="stack">
                <input type="hidden" name="room" value={room.id} />
                <p className="hint">{t("settings.leave.hint")}</p>
                <label className="check">
                  <input type="checkbox" name="confirm" value="yes" required /> {t("settings.leave.confirm")}
                </label>
                <button type="submit" className="danger">{t("settings.leave.button")}</button>
              </form>
              {error === "leave" && <p role="alert" className="error">{t("settings.leave.failed")}</p>}
            </details>
            <DeleteAccount failed={error === "delete"} back="/room/settings" />
          </section>
        </div>
      </div>
    </RoomShell>
  );
}
