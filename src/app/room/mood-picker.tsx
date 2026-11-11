"use client";

import { useState } from "react";
import { moods, type Mood } from "../../core/moods";
import { setMood } from "./actions";

// Choosing a mood previews it on this screen at once; "적용" saves it for both partners.
export function MoodPicker({ roomId, current }: { roomId: string; current: Mood }) {
  const [picked, setPicked] = useState<Mood>(current);
  const preview = (mood: Mood) => {
    setPicked(mood);
    document.querySelector<HTMLElement>(".room")?.setAttribute("data-mood", mood);
  };
  return (
    <form action={setMood} className="mood-form">
      <input type="hidden" name="room" value={roomId} />
      <fieldset>
        <legend>방 무드</legend>
        <div className="mood-grid">
          {moods.map((m) => (
            <label key={m.value} className="mood-option" data-mood={m.value}>
              <input
                type="radio"
                name="mood"
                value={m.value}
                checked={picked === m.value}
                onChange={() => preview(m.value)}
              />
              <span className="mood-swatch" aria-hidden="true" />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" disabled={picked === current}>
        {picked === current ? "지금 무드예요" : "이 무드로 바꾸기"}
      </button>
    </form>
  );
}
