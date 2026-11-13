// 오목 types and small helpers. The rules (turns, free cell, five-or-more, draw) live in the database.
export const GOMOKU_SIZE = 15;

export type GomokuMove = { n: number; x: number; y: number; by: "me" | "partner" };
export type GomokuState =
  | { game: null; myWins: number; partnerWins: number; draws: number }
  | {
      game: string;
      status: "open" | "won" | "draw";
      me: "black" | "white";
      turn: "me" | "partner" | null;
      winner: "me" | "partner" | null;
      winLine: [number, number][] | null;
      moves: GomokuMove[];
      myWins: number;
      partnerWins: number;
      draws: number;
    };

export type Stone = "black" | "white";

// Which colour a move is, seen from this player.
export function stoneOf(by: "me" | "partner", me: Stone): Stone {
  return by === "me" ? me : me === "black" ? "white" : "black";
}

export function cellLabel(x: number, y: number): string {
  return `${y + 1}행 ${x + 1}열`;
}

export function scoreLine(s: { myWins: number; partnerWins: number; draws: number }): string {
  return `나 ${s.myWins}승 · 상대 ${s.partnerWins}승 · 무승부 ${s.draws}`;
}
