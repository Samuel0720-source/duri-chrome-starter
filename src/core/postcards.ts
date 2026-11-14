export const postcardFaces = ["🍓", "🌷", "🎀", "🌙", "🍰", "📷", "🕊️"] as const;

export type PostcardState = {
  revision: number;
  phase: "idle" | "playing" | "finished";
  mySeat: 1 | 2;
  turnSeat: 1 | 2;
  scores: [number, number];
  cards: (number | null)[];
  owners: (number | null)[];
  open: number[];
  revealMs: number;
};

const questionKeys = ["post.q1", "post.q2", "post.q3", "post.q4", "post.q5", "post.q6", "post.q7",
  "post.q8", "post.q9", "post.q10", "post.q11", "post.q12", "post.q13", "post.q14"] as const;
export function postcardQuestion(day: string) {
  const n = Math.floor(Date.parse(day + "T00:00:00Z") / 86_400_000);
  return questionKeys[((n % questionKeys.length) + questionKeys.length) % questionKeys.length];
}
