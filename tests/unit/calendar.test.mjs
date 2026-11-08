import test from "node:test";
import assert from "node:assert/strict";
import { coupleCalendar, roomToday } from "../../src/core/dates.ts";
import { shouldCorrectDrift } from "../../src/core/playback.ts";

test("the first calendar date counts as day one and a planned start has a countdown", () => {
  assert.equal(coupleCalendar("2026-08-13", "2026-08-13").day, 1);
  assert.deepEqual(coupleCalendar("2026-08-13", "2026-08-11"), {
    status: "upcoming",
    daysToStart: 2,
  });
});
test("99 → 100 → 101 and the second hundred", () => {
  for (const [date, day, next, gap, celebrate] of [
    ["2026-11-19", 99, 100, 1, false],
    ["2026-11-20", 100, 200, 100, true],
    ["2026-11-21", 101, 200, 99, false],
    ["2027-02-28", 200, 300, 100, true],
  ]) {
    const c = coupleCalendar("2026-08-13", date);
    assert.deepEqual(
      [c.day, c.nextHundred, c.daysUntilHundred, c.milestoneToday],
      [day, next, gap, celebrate],
    );
  }
});
test("February 29 anniversaries use February 28 in a non-leap year", () => {
  assert.equal(coupleCalendar("2024-02-29", "2025-02-28").daysUntilAnnual, 0);
  assert.equal(coupleCalendar("2024-02-29", "2027-03-01").annual, "2028-02-29");
  assert.throws(() => coupleCalendar("2025-02-29", "2026-01-01"), RangeError);
});
test("the room chooses the calendar date even when partners are on opposite sides of midnight", () => {
  const now = new Date("2026-08-14T05:00:00Z");
  assert.equal(roomToday(now, "America/Vancouver"), "2026-08-13");
  assert.equal(roomToday(now, "America/Toronto"), "2026-08-14");
});
test("calendar days cross a daylight saving change", () => {
  assert.equal(coupleCalendar("2024-03-09", "2024-03-11").day, 3);
});
test("exactly one second stays put; a larger drift waits for cooldown", () => {
  assert.equal(shouldCorrectDrift(12, 11, 5000), false);
  assert.equal(shouldCorrectDrift(12.1, 11, 2999), false);
  assert.equal(shouldCorrectDrift(12.1, 11, 3000), true);
});
