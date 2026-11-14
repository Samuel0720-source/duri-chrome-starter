// The partners get the same board and question using the calendar day of their room.
const faces = ["🍓", "🚲", "🎧", "🌙", "🍰", "📷"] as const;
function dayNumber(day: string) {
  return Math.floor(Date.parse(day + "T00:00:00Z") / 86_400_000);
}
export function postcardBoard(day: string) {
  const cards = [...faces, ...faces];
  let seed = dayNumber(day) >>> 0;
  for (let i = cards.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((seed / 4294967296) * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
const questionKeys = ["post.q1", "post.q2", "post.q3", "post.q4", "post.q5", "post.q6", "post.q7",
  "post.q8", "post.q9", "post.q10", "post.q11", "post.q12", "post.q13", "post.q14"] as const;
export function postcardQuestion(day: string) {
  const n = dayNumber(day);
  return questionKeys[((n % questionKeys.length) + questionKeys.length) % questionKeys.length];
}
