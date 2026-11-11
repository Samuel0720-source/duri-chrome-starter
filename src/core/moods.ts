// The five shared room moods. The value is stored in couple_rooms.mood.
export const moods = [
  { value: "berry", label: "베리 크림" },
  { value: "forest", label: "숲속 산책" },
  { value: "cafe", label: "비 오는 카페" },
  { value: "sunset", label: "노을 피크닉" },
  { value: "night", label: "심야 영화관" },
] as const;
export type Mood = (typeof moods)[number]["value"];

export function isMood(value: unknown): value is Mood {
  return moods.some((m) => m.value === value);
}
