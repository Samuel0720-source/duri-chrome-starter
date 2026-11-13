import test from "node:test";
import assert from "node:assert/strict";
import { stoneOf, cellLabel, scoreLine, GOMOKU_SIZE } from "../../src/core/gomoku.ts";

test("stone colours are seen from this player", () => {
  assert.equal(stoneOf("me", "black"), "black");
  assert.equal(stoneOf("partner", "black"), "white");
  assert.equal(stoneOf("me", "white"), "white");
  assert.equal(stoneOf("partner", "white"), "black");
});

test("labels and score text", () => {
  assert.equal(GOMOKU_SIZE, 15);
  assert.equal(cellLabel(0, 0), "1행 1열");
  assert.equal(cellLabel(14, 6), "7행 15열");
  assert.equal(scoreLine({ myWins: 2, partnerWins: 1, draws: 0 }), "나 2승 · 상대 1승 · 무승부 0");
});
