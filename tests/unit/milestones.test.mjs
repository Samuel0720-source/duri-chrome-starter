import test from "node:test";
import assert from "node:assert/strict";
import { isMonthDay, upcomingMilestones } from "../../src/core/dates.ts";

const labels = (list) => list.map((m) => m.label);

test("only the next hundred-day mark and the next anniversary, plus special days within 100 days", () => {
  // 2026-11-09: Christmas is 46 days away; Valentine's Day (97 days) also fits; White Day (125) does not.
  const list = upcomingMilestones("2026-08-13", "2026-11-09");
  assert.deepEqual(labels(list), ["100일", "크리스마스", "발렌타인데이", "1주년"]);
  assert.deepEqual(list[0], { label: "100일", kind: "days", n: 100, date: "2026-11-20", daysLeft: 11 });
  assert.deepEqual(list[1], { label: "크리스마스", kind: "christmas", date: "2026-12-25", daysLeft: 46 });
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
  assert.deepEqual(upcomingMilestones("2026-08-13", "2026-11-20")[0], { label: "100일", kind: "days", n: 100, date: "2026-11-20", daysLeft: 0 });
});

test("a first day still ahead starts the count from that day", () => {
  assert.deepEqual(upcomingMilestones("2027-01-01", "2026-12-01")[0].date, "2026-12-25");
  assert.ok(upcomingMilestones("2027-01-01", "2026-12-01").some((m) => m.label === "100일" && m.date === "2027-04-10" && m.daysLeft === 130));
});

test("a 29 February start falls on 28 February in common years", () => {
  const list = upcomingMilestones("2024-02-29", "2026-11-09");
  assert.ok(list.some((m) => m.label === "3주년" && m.date === "2027-02-28"));
});

test("each milestone carries a kind (and a number) so any language can name it", async () => {
  const { makeT } = await import("../../src/i18n/dict.ts");
  const en = makeT("en");
  const list = upcomingMilestones("2026-08-13", "2026-11-09");
  assert.deepEqual(list.map((m) => en(`ms.${m.kind}`, { n: m.n ?? 0 })), ["Day 100", "Christmas", "Valentine's Day", "1-year anniversary"]);
});

test("birthdays show only within the next 100 days, with the partner's nickname", () => {
  const bdays = [{ who: "me", monthDay: "12-25" }, { who: "partner", monthDay: "01-10", name: "곰돌이" }, { who: "partner", monthDay: "06-01" }];
  const list = upcomingMilestones("2026-08-13", "2026-11-15", bdays).filter((m) => m.kind.endsWith("Birthday"));
  assert.deepEqual(list, [
    { label: "내 생일", kind: "myBirthday", date: "2026-12-25", daysLeft: 40 },
    { label: "곰돌이 생일", kind: "partnerBirthday", name: "곰돌이", date: "2027-01-10", daysLeft: 56 },
  ]);
  // Exactly 100 days away counts, 101 does not; today counts as D-day.
  assert.equal(upcomingMilestones("2026-08-13", "2026-11-15", [{ who: "me", monthDay: "02-23" }]).find((m) => m.kind === "myBirthday")?.daysLeft, 100);
  assert.equal(upcomingMilestones("2026-08-13", "2026-11-15", [{ who: "me", monthDay: "02-24" }]).some((m) => m.kind === "myBirthday"), false);
  assert.equal(upcomingMilestones("2026-08-13", "2026-11-15", [{ who: "me", monthDay: "11-15" }]).find((m) => m.kind === "myBirthday")?.daysLeft, 0);
});

test("a 29 February birthday falls on the 28th in other years; bad month-days are skipped", () => {
  assert.equal(upcomingMilestones("2026-08-13", "2026-12-01", [{ who: "me", monthDay: "02-29" }]).find((m) => m.kind === "myBirthday")?.date, "2027-02-28");
  assert.equal(upcomingMilestones("2026-08-13", "2027-12-01", [{ who: "me", monthDay: "02-29" }]).find((m) => m.kind === "myBirthday")?.date, "2028-02-29");
  const bad = upcomingMilestones("2026-08-13", "2026-11-15", [{ who: "me", monthDay: "02-30" }, { who: "me", monthDay: "13-01" }]);
  assert.equal(bad.some((m) => m.kind === "myBirthday"), false);
  assert.equal(isMonthDay("02-29"), true);
  assert.equal(isMonthDay("04-31"), false);
});
