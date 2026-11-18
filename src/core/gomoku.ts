import type { T } from "../i18n/dict.ts";

// 오목 types and small helpers. The rules (turns, free cell, five-or-more, draw) live in the database.
export const GOMOKU_SIZE = 15;

export type GomokuMove = { n: number; x: number; y: number; by: "me" | "partner" };
export type GomokuState =
  | { game: null; myWins: number; partnerWins: number; draws: number }
  | {
      game: string;
      status: "open" | "won" | "draw" | "cancelled";
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

export function cellLabel(x: number, y: number, t: T): string {
  return t("gomoku.cell", { row: y + 1, col: x + 1 });
}

export function scoreLine(s: { myWins: number; partnerWins: number; draws: number }, t: T, name: string): string {
  return t("gomoku.score", { me: s.myWins, name, them: s.partnerWins, draws: s.draws });
}
