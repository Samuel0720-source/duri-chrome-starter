import test from "node:test";
import assert from "node:assert/strict";
import { isBaseballNumber, nextMemo, score, typeDigit } from "../../src/core/baseball.ts";

test("score: strikes are right digit and place, balls right digit elsewhere", () => {
  assert.deepEqual(score("471", "471"), { s: 3, b: 0 });
  assert.deepEqual(score("471", "174"), { s: 1, b: 2 });
  assert.deepEqual(score("471", "714"), { s: 0, b: 3 });
  assert.deepEqual(score("471", "479"), { s: 2, b: 0 });
  assert.deepEqual(score("471", "235"), { s: 0, b: 0 });
  assert.deepEqual(score("012", "201"), { s: 0, b: 3 });
});

test("a number is three different digits, 0 allowed", () => {
  for (const ok of ["012", "987", "305"]) assert.equal(isBaseballNumber(ok), true, ok);
  for (const bad of ["112", "12", "1234", "1a3", "", "121"]) assert.equal(isBaseballNumber(bad), false, bad);
});

test("typing skips repeats and stops at three; the memo cycles ✗ -> ○ -> blank", () => {
  assert.equal(["4", "4", "7", "1", "9"].reduce(typeDigit, ""), "471");
  assert.equal(typeDigit("47", "x"), "47");
  assert.deepEqual([nextMemo(""), nextMemo("out"), nextMemo("in")], ["out", "in", ""]);
});
