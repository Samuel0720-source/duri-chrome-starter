import test from "node:test";
import assert from "node:assert/strict";
import { upcomingMilestones } from "../../src/core/dates.ts";

const labels = (list) => list.map((m) => m.label);

test("only the next hundred-day mark and the next anniversary, plus special days within 100 days", () => {
  // 2026-11-09: Christmas is 46 days away; Valentine's Day (97 days) also fits; White Day (125) does not.
  const list = upcomingMilestones("2026-08-13", "2026-11-09");
  assert.deepEqual(labels(list), ["100일", "크리스마스", "발렌타인데이", "1주년"]);
  assert.deepEqual(list[0], { label: "100일", date: "2026-11-20", daysLeft: 11 });
  assert.deepEqual(list[1], { label: "크리스마스", date: "2026-12-25", daysLeft: 46 });
  assert.equal(list.at(-1).date, "2027-08-13");
});

test("special days more than 100 days away are left out", () => {
  // 2026-04-01: Girlfriend's Day is 122 days away, so nothing special fits.
  assert.deepEqual(labels(upcomingMilestones("2026-01-01", "2026-04-01")), ["100일", "1주년"]);
});

test("a special day across the new year is found", () => {
  const list = upcomingMilestones("2025-06-01", "2026-12-20");
  assert.ok(list.some((m) => m.label === "크리스마스" && m.date === "2026-12-25" && m.daysLeft === 5));
  assert.ok(list.some((m) => m.label === "발렌타인데이" && m.date === "2027-02-14"));
});

test("a milestone falling today counts as zero days left", () => {
  assert.deepEqual(upcomingMilestones("2026-08-13", "2026-11-20")[0], { label: "100일", date: "2026-11-20", daysLeft: 0 });
});

test("a first day still ahead starts the count from that day", () => {
  assert.deepEqual(upcomingMilestones("2027-01-01", "2026-12-01")[0].date, "2026-12-25");
  assert.ok(upcomingMilestones("2027-01-01", "2026-12-01").some((m) => m.label === "100일" && m.date === "2027-04-10" && m.daysLeft === 130));
});

test("a 29 February start falls on 28 February in common years", () => {
  const list = upcomingMilestones("2024-02-29", "2026-11-09");
  assert.ok(list.some((m) => m.label === "3주년" && m.date === "2027-02-28"));
});
