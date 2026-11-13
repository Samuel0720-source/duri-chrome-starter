import test from "node:test";
import assert from "node:assert/strict";
import { readConditions, describeConditions, recommend, noConditions, activities } from "../../src/core/recommend.ts";

test("conditions are read from Korean sentences and stack up", () => {
  const first = readConditions("10분, 경쟁은 싫어");
  assert.deepEqual(first, { minutes: 10, noCompetition: true, quiet: false });
  const second = readConditions("말 안 해도 되는 걸로", first);
  assert.deepEqual(second, { minutes: 10, noCompetition: true, quiet: true });
  assert.equal(readConditions("1시간 30분 있어", noConditions).minutes, 90);
  assert.equal(readConditions("2시간", noConditions).minutes, 120);
  assert.deepEqual(readConditions("아무거나", noConditions), noConditions);
  assert.equal(readConditions("5분만", first).minutes, 5, "a new time replaces the old one");
  assert.deepEqual(describeConditions(second), ["10분", "경쟁은 싫어요", "말 안 해도 되는 걸로"]);
});

test("recommendations only use deployed activities and obey every condition", () => {
  const all = recommend(noConditions).map((p) => p.activity.id);
  assert.deepEqual(all, activities.map((a) => a.id));
  const ids = (c) => recommend(c).map((p) => p.activity.id);
  assert.deepEqual(ids(readConditions("10분, 경쟁은 싫어")), ["guess"], "draw is a race, watch needs 15 minutes");
  assert.deepEqual(ids(readConditions("30분, 경쟁은 싫어")), ["guess", "watch"]);
  assert.deepEqual(ids(readConditions("3분")), [], "nothing fits: the list is honestly empty");
  const quiet = recommend(readConditions("말 안 해도 되는 걸로"));
  assert.ok(quiet.every((p) => p.reasons.includes("말 없이 할 수 있어요")));
  for (const p of recommend(noConditions)) assert.ok(p.activity.href.startsWith("/room/"));
});
