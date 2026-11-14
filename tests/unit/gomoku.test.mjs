import test from "node:test";
import assert from "node:assert/strict";
import { stoneOf, cellLabel, scoreLine, GOMOKU_SIZE } from "../../src/core/gomoku.ts";
import { makeT } from "../../src/i18n/dict.ts";
const t = makeT("ko");
const en = makeT("en");

test("stone colours are seen from this player", () => {
  assert.equal(stoneOf("me", "black"), "black");
  assert.equal(stoneOf("partner", "black"), "white");
  assert.equal(stoneOf("me", "white"), "white");
  assert.equal(stoneOf("partner", "white"), "black");
});

test("labels and score text", () => {
  assert.equal(GOMOKU_SIZE, 15);
  assert.equal(cellLabel(0, 0, t), "1행 1열");
  assert.equal(cellLabel(14, 6, t), "7행 15열");
  assert.equal(cellLabel(14, 6, en), "row 7, column 15");
  assert.equal(scoreLine({ myWins: 2, partnerWins: 1, draws: 0 }, t, "상대"), "나 2승 · 상대 1승 · 무승부 0");
  assert.equal(scoreLine({ myWins: 2, partnerWins: 1, draws: 0 }, en, "Honey"), "Me 2 · Honey 1 · Draws 0");
});
