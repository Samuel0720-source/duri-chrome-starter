import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  drawCategories, categoryLabel, clockOffset, secondsLeft, timeShare, strokesToPaths, isValidSegment, formatSeconds, DRAW_SECONDS,
} from "../../src/core/draw.ts";

test("categories match the database and every category has at least 20 words", async () => {
  const sql = await readFile(new URL("../../supabase/migrations/202611120001_draw_quiz.sql", import.meta.url), "utf8");
  assert.deepEqual(drawCategories.map((c) => c.value), ["food", "animal", "thing", "place", "date"]);
  for (const { value } of drawCategories) {
    assert.ok(sql.includes("'" + value + "'"), value);
    const words = sql.match(new RegExp("\\('" + value + "', '[^']+'", "g")) ?? [];
    assert.ok(words.length >= 20, value + " has " + words.length);
  }
  assert.equal(categoryLabel("date"), "데이트 활동");
  assert.match(sql, /interval '100 seconds'/);
  assert.equal(DRAW_SECONDS, 100);
});

test("the countdown follows the database deadline, not the device clock", () => {
  // The database says it is 1,000,000 ms and the deadline is 100 s later.
  const deadline = 1_000_000 + 100_000;
  // A device whose clock is one hour fast still shows 100 s left once the offset is applied.
  const deviceNow = 1_000_000 + 3_600_000;
  const offset = clockOffset(1_000_000, deviceNow);
  assert.equal(secondsLeft(deadline, deviceNow, offset), 100);
  assert.equal(secondsLeft(deadline, deviceNow + 99_500, offset), 1, "rounds up: 0 only when over");
  assert.equal(secondsLeft(deadline, deviceNow + 100_000, offset), 0);
  assert.equal(secondsLeft(deadline, deviceNow + 500_000, offset), 0, "never negative");
  assert.equal(timeShare(deadline, deviceNow, offset), 1);
  assert.equal(timeShare(deadline, deviceNow + 50_000, offset), 0.5);
  assert.equal(timeShare(deadline, deviceNow + 200_000, offset), 0);
});

test("segments of one stroke join back into one path, and undo-able strokes stay separate", () => {
  const rows = [
    { seq: 3, stroke: "b", color: "#000000", width: 4, points: [[5, 5], [6, 6]] },
    { seq: 1, stroke: "a", color: "#ff0000", width: 10, points: [[1, 1], [2, 2]] },
    { seq: 2, stroke: "a", color: "#ff0000", width: 10, points: [[2, 2], [3, 3]] },
  ];
  const paths = strokesToPaths(rows);
  assert.equal(paths.length, 2);
  assert.deepEqual(paths[0], { color: "#ff0000", width: 10, points: [[1, 1], [2, 2], [2, 2], [3, 3]] });
  assert.equal(paths[1].color, "#000000");
});

test("the pen checks what the server checks", () => {
  assert.equal(isValidSegment([[0, 0], [1000, 750]], "#aabbcc", 4), true);
  assert.equal(isValidSegment([], "#aabbcc", 4), false);
  assert.equal(isValidSegment([[0, 1001]], "#aabbcc", 4), false);
  assert.equal(isValidSegment([[0, 0]], "red", 4), false);
  assert.equal(isValidSegment([[0, 0]], "#AABBCC", 4), false, "lower-case hex only");
  assert.equal(isValidSegment([[0, 0]], "#aabbcc", 41), false);
  assert.equal(isValidSegment(Array.from({ length: 251 }, () => [1, 1]), "#aabbcc", 4), false);
  assert.equal(formatSeconds(12.34), "12.3초");
  assert.equal(formatSeconds(7), "7초");
});
