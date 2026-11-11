import test from "node:test";
import assert from "node:assert/strict";
import { isMood, moods } from "../../src/core/moods.ts";
import { daysFrom } from "../../src/core/dates.ts";

test("exactly the five moods the database accepts", () => {
  assert.deepEqual(moods.map((m) => m.value), ["berry", "forest", "cafe", "sunset", "night"]);
  assert.equal(isMood("night"), true);
  assert.equal(isMood("neon"), false);
});

test("days from today to a plan", () => {
  assert.equal(daysFrom("2026-11-11", "2026-12-24"), 43);
  assert.equal(daysFrom("2026-11-11", "2026-11-11"), 0);
  assert.equal(daysFrom("2026-11-11", "2026-11-01"), -10);
});
