// 숫자야구: what the server sends each partner, plus the same rules the server uses (for tests and input checks).
export const DIGITS = 3;
export const MAX_GUESSES = 20;

export type BaseballGuess = { seat: number; guess: string; s: number; b: number };

export type BaseballState =
  | { phase: "idle"; revision: number; mySeat: number; wins: number[]; draws: number }
  | {
      phase: "setup" | "playing" | "finished";
      revision: number;
      game: number;
      mySeat: number;
      starter: number;
      turnSeat: number;
      mySecret: string | null;
      partnerReady: boolean;
      partnerSecret: string | null; // only once the game is finished
      guesses: BaseballGuess[];
      counts: number[];
      solved: boolean[];
      lastChance: boolean;
      winner: number | null; // 0 = draw
      wins: number[];
      draws: number;
    };

// Three different digits, 0-9.
export function isBaseballNumber(value: string): boolean {
  return new RegExp(`^[0-9]{${DIGITS}}$`).test(value) && new Set(value).size === DIGITS;
}

// Strikes: right digit in the right place. Balls: right digit, wrong place.
export function score(secret: string, guess: string): { s: number; b: number } {
  let s = 0;
  let b = 0;
  for (let i = 0; i < guess.length; i++) {
    if (secret[i] === guess[i]) s++;
    else if (secret.includes(guess[i])) b++;
  }
  return { s, b };
}

// The memo pad cycles each digit: unknown -> not in it (✗) -> in it (○) -> unknown.
export type Memo = "" | "out" | "in";
export const nextMemo = (m: Memo): Memo => (m === "" ? "out" : m === "out" ? "in" : "");

// Add a digit to the typed number: ignores repeats and anything past DIGITS.
export function typeDigit(current: string, digit: string): string {
  if (!/^[0-9]$/.test(digit) || current.includes(digit) || current.length >= DIGITS) return current;
  return current + digit;
}
