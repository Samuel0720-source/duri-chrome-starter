// The five shared room themes ("moods"). The value is stored in couple_rooms.mood;
// the name shown comes from the dictionary key mood.<value>.
export const moods = [
  { value: "berry" },
  { value: "forest" },
  { value: "cafe" },
  { value: "sunset" },
  { value: "night" },
] as const;
export type Mood = (typeof moods)[number]["value"];

export function isMood(value: unknown): value is Mood {
  return moods.some((m) => m.value === value);
}
