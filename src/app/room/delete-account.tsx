import { getT } from "../../i18n/server";
import { deleteAccount } from "./actions";

export async function DeleteAccount({ failed, back }: { failed: boolean; back: "/room" | "/room/settings" }) {
  const { t } = await getT();
  return (
    <details className="leave" open={failed}>
      <summary>{t("settings.delete.title")}</summary>
      <form action={deleteAccount} className="stack">
        <input type="hidden" name="back" value={back} />
        <p className="hint">{t("settings.delete.hint")}</p>
        <label className="check">
          <input type="checkbox" name="confirm" value="yes" required /> {t("settings.delete.confirm")}
        </label>
        <button type="submit" className="danger">{t("settings.delete.button")}</button>
      </form>
      {failed && <p role="alert" className="error">{t("settings.delete.failed")}</p>}
    </details>
  );
}
