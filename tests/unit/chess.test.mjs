import test from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_POSITION, applyMove, capturedSummary, chessScoreLine, isInsufficientMaterial,
  legalMovesForSquare, parseSq, positionKey, sqName,
} from "../../src/core/chess.ts";
import { makeT } from "../../src/i18n/dict.ts";

const ko = makeT("ko");
const en = makeT("en");

function playSeq(moves) {
  let pos = INITIAL_POSITION;
  const keys = [positionKey(pos)];
  let last = null;
  for (const [fromStr, toStr, promo] of moves) {
    const res = applyMove(pos, parseSq(fromStr), parseSq(toStr), promo, keys);
    assert.ok(res, `expected legal move ${fromStr}->${toStr}`);
    pos = res.next;
    keys.push(positionKey(pos));
    last = res;
  }
  return { pos, last, keys };
}

test("Fool's mate ends in checkmate", () => {
  const { last } = playSeq([
    ["f2", "f3"],
    ["e7", "e5"],
    ["g2", "g4"],
    ["d8", "h4"],
  ]);
  assert.equal(last.status, "won");
  assert.equal(last.isCheck, true);
  assert.equal(last.notation, "Qh4#");
});

test("castling (kingside/queenside), en passant, and pawn promotion work accurately", () => {
  // En passant + expiry
  const { pos: epPos, last: epMove } = playSeq([
    ["e2", "e4"],
    ["a7", "a6"],
    ["e4", "e5"],
    ["d7", "d5"],
    ["e5", "d6"],
  ]);
  assert.equal(epMove.notation, "exd6");
  assert.equal(epPos.board[parseSq("d5")], ".");
  assert.equal(epPos.board[parseSq("d6")], "P");

  // Kingside castling allowed only when path clear and unattacked
  const castlePos = {
    board:
      "r...k..r" +
      "........" +
      "........" +
      "........" +
      "........" +
      "........" +
      "........" +
      "R...K..R",
    turn: "w",
    castling: "KQkq",
    ep: null,
    halfmove: 0,
  };
  const kingTargets = legalMovesForSquare(castlePos, parseSq("e1")).map((m) => sqName(m.to));
  assert.ok(kingTargets.includes("g1"));
  assert.ok(kingTargets.includes("c1"));
  const castled = applyMove(castlePos, parseSq("e1"), parseSq("g1"));
  assert.ok(castled);
  assert.equal(castled.notation, "O-O");
  assert.equal(castled.next.board[parseSq("g1")], "K");
  assert.equal(castled.next.board[parseSq("f1")], "R");
  assert.equal(castled.next.castling, "kq");

  // Pawn promotion
  const promoPos = {
    board:
      "....k..." +
      "P......." +
      "........" +
      "........" +
      "........" +
      "........" +
      "........" +
      "....K...",
    turn: "w",
    castling: "",
    ep: null,
    halfmove: 0,
  };
  const promoMoves = legalMovesForSquare(promoPos, parseSq("a7"));
  assert.equal(promoMoves.length, 4);
  const knightPromo = applyMove(promoPos, parseSq("a7"), parseSq("a8"), "n");
  assert.ok(knightPromo);
  assert.equal(knightPromo.next.board[parseSq("a8")], "N");
  assert.equal(knightPromo.notation, "a8=N");
});

test("pinned piece cannot leave its king in check", () => {
  const pinnedPos = {
    board:
      "....r..." +
      "........" +
      "........" +
      "........" +
      "....R..." +
      "........" +
      "........" +
      "....K..k",
    turn: "w",
    castling: "",
    ep: null,
    halfmove: 0,
  };
  const rookTargets = legalMovesForSquare(pinnedPos, parseSq("e4")).map((m) => sqName(m.to));
  assert.ok(rookTargets.includes("e8"));
  assert.ok(!rookTargets.includes("d4"));
});

test("stalemate, insufficient material, 50-move rule, and threefold repetition end in draws", () => {
  const stalemateSetup = {
    board:
      ".......k" +
      "........" +
      ".....K.." +
      "........" +
      "........" +
      "......Q." +
      "........" +
      "........",
    turn: "w",
    castling: "",
    ep: null,
    halfmove: 0,
  };
  const stale = applyMove(stalemateSetup, parseSq("g3"), parseSq("g6"));
  assert.equal(stale?.status, "draw");
  assert.equal(stale?.drawReason, "stalemate");

  const kvkBoard =
    "....k..." +
    "........" +
    "........" +
    "........" +
    "........" +
    "........" +
    "........" +
    "....K...";
  assert.equal(isInsufficientMaterial(kvkBoard), true);

  const fiftyPos = { board: kvkBoard, turn: "w", castling: "", ep: null, halfmove: 99 };
  const fiftyMove = applyMove(fiftyPos, parseSq("e1"), parseSq("d1"));
  assert.equal(fiftyMove?.status, "draw");
  assert.equal(fiftyMove?.drawReason, "material");

  const rookLoopBoard =
    "r...k..." +
    "........" +
    "........" +
    "........" +
    "........" +
    "........" +
    "........" +
    "R...K...";
  const fiftyOnly = { board: rookLoopBoard, turn: "w", castling: "", ep: null, halfmove: 99 };
  assert.equal(applyMove(fiftyOnly, parseSq("a1"), parseSq("b1"))?.drawReason, "fifty");

  // Threefold repetition via knight dance
  const { last: repLast } = playSeq([
    ["g1", "f3"], ["g8", "f6"],
    ["f3", "g1"], ["f6", "g8"],
    ["g1", "f3"], ["g8", "f6"],
    ["f3", "g1"], ["f6", "g8"],
  ]);
  assert.equal(repLast.status, "draw");
  assert.equal(repLast.drawReason, "repetition");
});

test("capturedSummary and chessScoreLine format material advantage and score", () => {
  const afterQCapture =
    "rnb.kbnr" +
    "pppppppp" +
    "........" +
    "........" +
    "........" +
    "........" +
    "PPPPPPPP" +
    "RNBQKBNR";
  const summary = capturedSummary(afterQCapture);
  assert.deepEqual(summary.capturedByWhite, ["q"]);
  assert.deepEqual(summary.capturedByBlack, []);
  assert.equal(summary.whiteLead, 9);
  assert.match(ko("chess.title"), /체스/);
  assert.match(chessScoreLine({ myWins: 2, partnerWins: 1, draws: 1 }, en, "Sam"), /Me 2 · Sam 1 · Draws 1/);
});
