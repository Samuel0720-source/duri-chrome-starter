import type { T } from "../i18n/dict.ts";

// Pure 8x8 chess rules shared between the UI (instant legal move hints + optimistic moves) and tests.
// The database validates and commits every move under a row lock.
export const INITIAL_BOARD = "rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR";

export type ChessColor = "w" | "b";
export type PromoPiece = "q" | "r" | "b" | "n";
export type DrawReason = "stalemate" | "fifty" | "material" | "repetition";

export type ChessPosition = {
  board: string; // 64 chars, index 0 = a8 ... index 63 = h1
  turn: ChessColor;
  castling: string; // subset of "KQkq"
  ep: number | null; // en passant target square index (0..63)
  halfmove: number;
};

export type ChessMoveInput = { from: number; to: number; promo?: PromoPiece };
export type ChessMoveRecord = {
  n: number;
  from: number;
  to: number;
  promo: PromoPiece | null;
  notation: string;
  boardAfter: string;
};

export type ChessState =
  | { game: null; myWins: number; partnerWins: number; draws: number }
  | {
      game: string;
      status: "open" | "won" | "draw";
      drawReason: DrawReason | null;
      me: "white" | "black";
      turn: "me" | "partner" | null;
      winner: "me" | "partner" | null;
      board: string;
      castling: string;
      ep: number | null;
      halfmove: number;
      inCheck: boolean;
      lastMove: { from: number; to: number } | null;
      moves: ChessMoveRecord[];
      myWins: number;
      partnerWins: number;
      draws: number;
    };

export const INITIAL_POSITION: ChessPosition = {
  board: INITIAL_BOARD,
  turn: "w",
  castling: "KQkq",
  ep: null,
  halfmove: 0,
};

export function sqRow(sq: number): number {
  return Math.floor(sq / 8);
}
export function sqCol(sq: number): number {
  return sq % 8;
}
export function sqIndex(row: number, col: number): number {
  return row * 8 + col;
}
export function sqName(sq: number): string {
  return "abcdefgh"[sqCol(sq)] + String(8 - sqRow(sq));
}
export function parseSq(name: string): number | null {
  if (!/^[a-h][1-8]$/.test(name)) return null;
  const col = name.charCodeAt(0) - 97;
  const row = 8 - Number(name[1]);
  return sqIndex(row, col);
}

export function pieceColor(ch: string): ChessColor | null {
  if (ch >= "A" && ch <= "Z") return "w";
  if (ch >= "a" && ch <= "z") return "b";
  return null;
}

export function findKing(board: string, color: ChessColor): number {
  return board.indexOf(color === "w" ? "K" : "k");
}

const KNIGHT_DELTAS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1],
] as const;
const KING_DELTAS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
] as const;
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const;
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

export function isSquareAttacked(board: string, sq: number, by: ChessColor): boolean {
  const r = sqRow(sq);
  const c = sqCol(sq);

  // Pawn attacks (a white pawn attacks upward, so it sits at r+1; a black pawn attacks downward, so r-1).
  const pawn = by === "w" ? "P" : "p";
  const pr = by === "w" ? r + 1 : r - 1;
  if (pr >= 0 && pr < 8) {
    if (c - 1 >= 0 && board[sqIndex(pr, c - 1)] === pawn) return true;
    if (c + 1 < 8 && board[sqIndex(pr, c + 1)] === pawn) return true;
  }

  // Knight attacks
  const knight = by === "w" ? "N" : "n";
  for (const [dr, dc] of KNIGHT_DELTAS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[sqIndex(nr, nc)] === knight) return true;
  }

  // King attacks
  const king = by === "w" ? "K" : "k";
  for (const [dr, dc] of KING_DELTAS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[sqIndex(nr, nc)] === king) return true;
  }

  // Diagonal rays: bishop or queen
  const bishop = by === "w" ? "B" : "b";
  const queen = by === "w" ? "Q" : "q";
  for (const [dr, dc] of BISHOP_DIRS) {
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[sqIndex(nr, nc)];
      if (p !== ".") {
        if (p === bishop || p === queen) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  // Orthogonal rays: rook or queen
  const rook = by === "w" ? "R" : "r";
  for (const [dr, dc] of ROOK_DIRS) {
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const p = board[sqIndex(nr, nc)];
      if (p !== ".") {
        if (p === rook || p === queen) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }

  return false;
}

export function isInCheck(board: string, color: ChessColor): boolean {
  const k = findKing(board, color);
  if (k < 0) return false;
  return isSquareAttacked(board, k, color === "w" ? "b" : "w");
}

function setChar(s: string, index: number, ch: string): string {
  return s.slice(0, index) + ch + s.slice(index + 1);
}

function executeRaw(pos: ChessPosition, from: number, to: number, promo?: PromoPiece): ChessPosition {
  const piece = pos.board[from];
  const lower = piece.toLowerCase();
  let board = setChar(pos.board, from, ".");
  let castling = pos.castling;
  let ep: number | null = null;
  const isCapture = pos.board[to] !== "." || (lower === "p" && to === pos.ep);

  // En passant capture removes the pawn on the starting rank of `from` and file of `to`.
  if (lower === "p" && to === pos.ep) {
    const capSq = sqIndex(sqRow(from), sqCol(to));
    board = setChar(board, capSq, ".");
  }

  // Castling moves the rook as well.
  if (lower === "k" && Math.abs(sqCol(to) - sqCol(from)) === 2) {
    const r = sqRow(from);
    if (sqCol(to) === 6) {
      board = setChar(board, sqIndex(r, 7), ".");
      board = setChar(board, sqIndex(r, 5), pos.turn === "w" ? "R" : "r");
    } else if (sqCol(to) === 2) {
      board = setChar(board, sqIndex(r, 0), ".");
      board = setChar(board, sqIndex(r, 3), pos.turn === "w" ? "R" : "r");
    }
  }

  // Promotion
  let placed = piece;
  if (lower === "p" && (sqRow(to) === 0 || sqRow(to) === 7)) {
    const p = promo ?? "q";
    placed = pos.turn === "w" ? p.toUpperCase() : p;
  }
  board = setChar(board, to, placed);

  // Double pawn push sets en passant square.
  if (lower === "p" && Math.abs(sqRow(to) - sqRow(from)) === 2) {
    ep = sqIndex((sqRow(from) + sqRow(to)) / 2, sqCol(from));
  }

  // Update castling rights when king or rooks move or rooks are captured.
  if (piece === "K") castling = castling.replace("K", "").replace("Q", "");
  if (piece === "k") castling = castling.replace("k", "").replace("q", "");
  if (from === 63 || to === 63) castling = castling.replace("K", "");
  if (from === 56 || to === 56) castling = castling.replace("Q", "");
  if (from === 7 || to === 7) castling = castling.replace("k", "");
  if (from === 0 || to === 0) castling = castling.replace("q", "");

  return {
    board,
    turn: pos.turn === "w" ? "b" : "w",
    castling,
    ep,
    halfmove: lower === "p" || isCapture ? 0 : pos.halfmove + 1,
  };
}

function pseudoMovesFrom(pos: ChessPosition, from: number): ChessMoveInput[] {
  const piece = pos.board[from];
  const color = pieceColor(piece);
  if (color !== pos.turn) return [];
  const lower = piece.toLowerCase();
  const r = sqRow(from);
  const c = sqCol(from);
  const moves: ChessMoveInput[] = [];
  const enemy: ChessColor = color === "w" ? "b" : "w";

  if (lower === "p") {
    const dir = color === "w" ? -1 : 1;
    const startRow = color === "w" ? 6 : 1;
    const promoRow = color === "w" ? 0 : 7;
    const nr = r + dir;
    if (nr >= 0 && nr < 8) {
      const one = sqIndex(nr, c);
      if (pos.board[one] === ".") {
        if (nr === promoRow) {
          for (const promo of ["q", "r", "b", "n"] as const) moves.push({ from, to: one, promo });
        } else {
          moves.push({ from, to: one });
          if (r === startRow) {
            const two = sqIndex(r + dir * 2, c);
            if (pos.board[two] === ".") moves.push({ from, to: two });
          }
        }
      }
      for (const dc of [-1, 1] as const) {
        const nc = c + dc;
        if (nc < 0 || nc >= 8) continue;
        const cap = sqIndex(nr, nc);
        const targetColor = pieceColor(pos.board[cap]);
        if (targetColor === enemy) {
          if (nr === promoRow) {
            for (const promo of ["q", "r", "b", "n"] as const) moves.push({ from, to: cap, promo });
          } else {
            moves.push({ from, to: cap });
          }
        } else if (pos.ep === cap) {
          moves.push({ from, to: cap });
        }
      }
    }
    return moves;
  }

  if (lower === "n") {
    for (const [dr, dc] of KNIGHT_DELTAS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
      const to = sqIndex(nr, nc);
      if (pieceColor(pos.board[to]) !== color) moves.push({ from, to });
    }
    return moves;
  }

  if (lower === "k") {
    for (const [dr, dc] of KING_DELTAS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;
      const to = sqIndex(nr, nc);
      if (pieceColor(pos.board[to]) !== color) moves.push({ from, to });
    }
    // Castling
    if (color === "w" && from === 60 && !isSquareAttacked(pos.board, 60, "b")) {
      if (pos.castling.includes("K") && pos.board[61] === "." && pos.board[62] === "." && pos.board[63] === "R"
        && !isSquareAttacked(pos.board, 61, "b") && !isSquareAttacked(pos.board, 62, "b")) {
        moves.push({ from, to: 62 });
      }
      if (pos.castling.includes("Q") && pos.board[59] === "." && pos.board[58] === "." && pos.board[57] === "." && pos.board[56] === "R"
        && !isSquareAttacked(pos.board, 59, "b") && !isSquareAttacked(pos.board, 58, "b")) {
        moves.push({ from, to: 58 });
      }
    } else if (color === "b" && from === 4 && !isSquareAttacked(pos.board, 4, "w")) {
      if (pos.castling.includes("k") && pos.board[5] === "." && pos.board[6] === "." && pos.board[7] === "r"
        && !isSquareAttacked(pos.board, 5, "w") && !isSquareAttacked(pos.board, 6, "w")) {
        moves.push({ from, to: 6 });
      }
      if (pos.castling.includes("q") && pos.board[3] === "." && pos.board[2] === "." && pos.board[1] === "." && pos.board[0] === "r"
        && !isSquareAttacked(pos.board, 3, "w") && !isSquareAttacked(pos.board, 2, "w")) {
        moves.push({ from, to: 2 });
      }
    }
    return moves;
  }

  const dirs = lower === "b" ? BISHOP_DIRS : lower === "r" ? ROOK_DIRS : [...BISHOP_DIRS, ...ROOK_DIRS];
  for (const [dr, dc] of dirs) {
    let nr = r + dr;
    let nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
      const to = sqIndex(nr, nc);
      const tc = pieceColor(pos.board[to]);
      if (tc === null) {
        moves.push({ from, to });
      } else {
        if (tc === enemy) moves.push({ from, to });
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
  return moves;
}

export function legalMovesForSquare(pos: ChessPosition, from: number): ChessMoveInput[] {
  const candidates = pseudoMovesFrom(pos, from);
  return candidates.filter((m) => !isInCheck(executeRaw(pos, m.from, m.to, m.promo).board, pos.turn));
}

export function legalMoves(pos: ChessPosition): ChessMoveInput[] {
  const all: ChessMoveInput[] = [];
  for (let sq = 0; sq < 64; sq++) {
    if (pieceColor(pos.board[sq]) === pos.turn) all.push(...legalMovesForSquare(pos, sq));
  }
  return all;
}

export function isInsufficientMaterial(board: string): boolean {
  const wMinors: { type: string; sq: number }[] = [];
  const bMinors: { type: string; sq: number }[] = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p === "." || p === "K" || p === "k") continue;
    const low = p.toLowerCase();
    if (low === "p" || low === "r" || low === "q") return false;
    (pieceColor(p) === "w" ? wMinors : bMinors).push({ type: low, sq: i });
  }
  if (wMinors.length === 0 && bMinors.length === 0) return true;
  if (wMinors.length + bMinors.length === 1) return true;
  if (wMinors.length === 1 && bMinors.length === 1 && wMinors[0].type === "b" && bMinors[0].type === "b") {
    const c1 = (sqRow(wMinors[0].sq) + sqCol(wMinors[0].sq)) % 2;
    const c2 = (sqRow(bMinors[0].sq) + sqCol(bMinors[0].sq)) % 2;
    return c1 === c2;
  }
  return false;
}

export function positionKey(pos: ChessPosition): string {
  return `${pos.board}:${pos.turn}:${pos.castling}:${pos.ep ?? "-"}`;
}

export function moveNotation(pos: ChessPosition, from: number, to: number, promo?: PromoPiece, suffix = ""): string {
  const piece = pos.board[from];
  const lower = piece.toLowerCase();
  if (lower === "k" && Math.abs(sqCol(to) - sqCol(from)) === 2) {
    return (sqCol(to) === 6 ? "O-O" : "O-O-O") + suffix;
  }
  const capture = pos.board[to] !== "." || (lower === "p" && to === pos.ep);
  if (lower === "p") {
    const base = (capture ? "abcdefgh"[sqCol(from)] + "x" : "") + sqName(to);
    const pr = promo ? "=" + promo.toUpperCase() : "";
    return base + pr + suffix;
  }
  const siblings = legalMoves(pos).filter((m) => m.from !== from && m.to === to && pos.board[m.from] === piece);
  let disambig = "";
  if (siblings.length > 0) {
    const sameCol = siblings.some((m) => sqCol(m.from) === sqCol(from));
    const sameRow = siblings.some((m) => sqRow(m.from) === sqRow(from));
    if (!sameCol) disambig = "abcdefgh"[sqCol(from)];
    else if (!sameRow) disambig = String(8 - sqRow(from));
    else disambig = sqName(from);
  }
  return piece.toUpperCase() + disambig + (capture ? "x" : "") + sqName(to) + suffix;
}

export function applyMove(
  pos: ChessPosition,
  from: number,
  to: number,
  promo?: PromoPiece,
  priorPositionKeys: string[] = [],
): {
  next: ChessPosition;
  notation: string;
  isCheck: boolean;
  status: "open" | "won" | "draw";
  drawReason: DrawReason | null;
} | null {
  const valid = legalMovesForSquare(pos, from).find(
    (m) => m.to === to && (m.promo ?? null) === (promo ?? (pos.board[from].toLowerCase() === "p" && (sqRow(to) === 0 || sqRow(to) === 7) ? "q" : null)),
  );
  if (!valid) return null;

  const next = executeRaw(pos, from, to, valid.promo);
  const check = isInCheck(next.board, next.turn);
  const replies = legalMoves(next);

  let status: "open" | "won" | "draw" = "open";
  let drawReason: DrawReason | null = null;
  let suffix = check ? "+" : "";

  if (replies.length === 0) {
    if (check) {
      status = "won";
      suffix = "#";
    } else {
      status = "draw";
      drawReason = "stalemate";
    }
  } else if (isInsufficientMaterial(next.board)) {
    status = "draw";
    drawReason = "material";
  } else if (next.halfmove >= 100) {
    status = "draw";
    drawReason = "fifty";
  } else if (priorPositionKeys.length > 0) {
    const key = positionKey(next);
    const repeats = priorPositionKeys.filter((k) => k === key).length;
    if (repeats >= 2) {
      status = "draw";
      drawReason = "repetition";
    }
  }

  return {
    next,
    notation: moveNotation(pos, from, to, valid.promo, suffix),
    isCheck: check,
    status,
    drawReason,
  };
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START_COUNTS: Record<string, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 };

export function capturedSummary(board: string) {
  const wHave: Record<string, number> = { q: 0, r: 0, b: 0, n: 0, p: 0 };
  const bHave: Record<string, number> = { q: 0, r: 0, b: 0, n: 0, p: 0 };
  let wMat = 0;
  let bMat = 0;
  for (const ch of board) {
    if (ch === ".") continue;
    const low = ch.toLowerCase();
    if (pieceColor(ch) === "w") {
      if (low in wHave) wHave[low]++;
      wMat += PIECE_VALUES[low] ?? 0;
    } else {
      if (low in bHave) bHave[low]++;
      bMat += PIECE_VALUES[low] ?? 0;
    }
  }
  const capturedByWhite: string[] = [];
  const capturedByBlack: string[] = [];
  for (const type of ["q", "r", "b", "n", "p"]) {
    const missB = Math.max(0, START_COUNTS[type] - bHave[type]);
    for (let i = 0; i < missB; i++) capturedByWhite.push(type); // black pieces captured by white
    const missW = Math.max(0, START_COUNTS[type] - wHave[type]);
    for (let i = 0; i < missW; i++) capturedByBlack.push(type.toUpperCase()); // white pieces captured by black
  }
  return { capturedByWhite, capturedByBlack, whiteLead: wMat - bMat };
}

export function chessScoreLine(s: { myWins: number; partnerWins: number; draws: number }, t: T, name: string): string {
  return t("gomoku.score", { me: s.myWins, name, them: s.partnerWins, draws: s.draws });
}
