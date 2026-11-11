import test from "node:test";
import assert from "node:assert/strict";
import { upcomingMilestones } from "../../src/core/dates.ts";

test("milestones are the next hundred-day marks and anniversaries, soonest first", () => {
  const list = upcomingMilestones("2026-08-13", "2026-11-09", 4);
  assert.deepEqual(list.map((m) => m.label), ["100일", "200일", "300일", "1주년"]);
  assert.deepEqual(list[0], { label: "100일", date: "2026-11-20", daysLeft: 11 });
  assert.equal(list[3].date, "2027-08-13");
});

test("a milestone falling today counts as zero days left", () => {
  assert.deepEqual(upcomingMilestones("2026-08-13", "2026-11-20", 1)[0], { label: "100일", date: "2026-11-20", daysLeft: 0 });
});

test("a first day still ahead starts the count from that day", () => {
  assert.deepEqual(upcomingMilestones("2027-01-01", "2026-12-01", 1)[0], { label: "100일", date: "2027-04-10", daysLeft: 130 });
});

test("a 29 February start falls on 28 February in common years", () => {
  const list = upcomingMilestones("2024-02-29", "2026-11-09", 12);
  assert.ok(list.some((m) => m.label === "3주년" && m.date === "2027-02-28"));
});
