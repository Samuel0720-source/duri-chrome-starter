"use client";

import { useState } from "react";
import { moods, type Mood } from "../../core/moods";
import { useT } from "../../i18n/client";
import { setMood } from "./actions";

// Choosing a theme previews it on this screen at once; saving applies it for both partners.
export function MoodPicker({ roomId, current }: { roomId: string; current: Mood }) {
  const { t } = useT();
  const [picked, setPicked] = useState<Mood>(current);
  const preview = (mood: Mood) => {
    setPicked(mood);
    document.querySelector<HTMLElement>(".room")?.setAttribute("data-mood", mood);
  };
  return (
    <form action={setMood} className="mood-form">
      <input type="hidden" name="room" value={roomId} />
      <fieldset>
        <legend>{t("settings.room.theme")}</legend>
        <p className="hint">{t("settings.room.themeHint")}</p>
        <div className="mood-grid">
          {moods.map((m) => (
            <label key={m.value} className="mood-option" data-mood={m.value}>
              <input type="radio" name="mood" value={m.value} checked={picked === m.value} onChange={() => preview(m.value)} />
              <span className="mood-swatch" aria-hidden="true" />
              <span>{t(`mood.${m.value}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" disabled={picked === current}>
        {picked === current ? t("settings.room.themeCurrent") : t("settings.room.themeApply")}
      </button>
    </form>
  );
}
