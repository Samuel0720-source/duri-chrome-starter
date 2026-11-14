import test from "node:test";
import assert from "node:assert/strict";
import { readConditions, describeConditions, recommend, noConditions, activities } from "../../src/core/recommend.ts";
import { makeT } from "../../src/i18n/dict.ts";

const ko = makeT("ko");
const en = makeT("en");
const say = (t, phrases) => phrases.map((p) => t(p.key, p.vars));

test("conditions are read from Korean sentences and stack up", () => {
  const first = readConditions("10분, 경쟁은 싫어");
  assert.deepEqual(first, { minutes: 10, noCompetition: true, quiet: false });
  const second = readConditions("말 안 해도 되는 걸로", first);
  assert.deepEqual(second, { minutes: 10, noCompetition: true, quiet: true });
  assert.equal(readConditions("1시간 30분 있어", noConditions).minutes, 90);
  assert.equal(readConditions("2시간", noConditions).minutes, 120);
  assert.deepEqual(readConditions("아무거나", noConditions), noConditions);
  assert.equal(readConditions("5분만", first).minutes, 5, "a new time replaces the old one");
  assert.deepEqual(say(ko, describeConditions(second)), ["10분", "경쟁은 싫어요", "말 안 해도 되는 걸로"]);
});

test("…and from English sentences", () => {
  assert.deepEqual(readConditions("20 min, no competition please"), { minutes: 20, noCompetition: true, quiet: false });
  assert.equal(readConditions("we have 1 hour 30 minutes").minutes, 90);
  assert.equal(readConditions("2 hours").minutes, 120);
  assert.equal(readConditions("something quiet").quiet, true);
  assert.deepEqual(say(en, describeConditions(readConditions("2 hours, quiet"))), ["2 h", "Something quiet"]);
});

test("recommendations only use deployed activities and obey every condition", () => {
  const all = recommend(noConditions).map((p) => p.activity.id);
  assert.deepEqual(all, activities.map((a) => a.id));
  assert.deepEqual(all, ["guess", "draw", "gomoku", "golf", "watch"]);
  const ids = (c) => recommend(c).map((p) => p.activity.id);
  assert.deepEqual(ids(readConditions("10분, 경쟁은 싫어")), ["guess"], "the others are races or need 15 minutes");
  assert.deepEqual(ids(readConditions("30분, 경쟁은 싫어")), ["guess", "watch"]);
  assert.deepEqual(ids(readConditions("3분")), [], "nothing fits: the list is honestly empty");
  const quiet = recommend(readConditions("말 안 해도 되는 걸로"));
  assert.ok(quiet.every((p) => say(ko, p.reasons).includes("말 없이 할 수 있어요")));
  for (const p of recommend(noConditions)) {
    assert.ok(p.activity.href.startsWith("/room/"));
    assert.ok(ko(`helper.act.${p.activity.id}.title`).length > 0 && !en(`helper.act.${p.activity.id}.title`).startsWith("helper."));
  }
});
