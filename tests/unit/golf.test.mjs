import test from "node:test";
import assert from "node:assert/strict";
import { ballAt, aimFromDrag, bestLine, runningStrokes, updateClock, replayDelay, MAX_PULL, TICK_MS } from "../../src/core/golf.ts";

// A path with one point per tick: 3 ticks long, 100 px per tick.
const ball = (o = {}) => ({ x: 400, y: 100, strokes: 1, total: 0, holed: false, water: false, shotNo: 1, startedMs: 1000, untilMs: 1000 + 3 * TICK_MS, path: [[100, 100], [200, 100], [300, 100], [400, 100]], ...o });

test("a ball at rest stays at its stored place", () => {
  assert.deepEqual(ballAt(ball({ path: null, startedMs: null }), 5000), { x: 400, y: 100, moving: false });
  assert.deepEqual(ballAt(ball(), 3 * TICK_MS), { x: 400, y: 100, moving: false });
});

test("replay: path[i] is the place after i ticks", () => {
  assert.deepEqual(ballAt(ball(), -50), { x: 100, y: 100, moving: true });
  assert.deepEqual(ballAt(ball(), TICK_MS), { x: 200, y: 100, moving: true });
  const half = ballAt(ball(), 1.5 * TICK_MS);
  assert.ok(Math.abs(half.x - 250) < 1e-9);
});

test("water: during the roll it goes into the lake, at the end it is back at the start", () => {
  const wet = ball({ x: 100, y: 100, water: true });
  assert.equal(ballAt(wet, 2 * TICK_MS).x, 300);
  assert.deepEqual(ballAt(wet, 10 * TICK_MS), { x: 100, y: 100, moving: false });
});

test("clock: the shortest round trip wins, so a slow reply cannot shift the ball", () => {
  let c = updateClock(null, 10_100, 0, 200); // rtt 200 -> offset 10_000
  assert.equal(c.offset, 10_000);
  c = updateClock(c, 10_900, 500, 1300); // rtt 800, would say 10_000 too, but is ignored anyway
  assert.equal(c.rtt, 200);
  c = updateClock(c, 12_040, 2000, 2060); // rtt 60 replaces it
  assert.equal(c.rtt, 60);
  assert.equal(c.offset, 10_010);
  const stale = updateClock(c, 80_000, 70_000, 70_900); // a minute later any reading is fine
  assert.equal(stale.rtt, 900);
});

test("a late replay starts from the beginning instead of jumping", () => {
  assert.equal(replayDelay(1300, 1000), 300);
  assert.equal(replayDelay(900, 1000), 0, "early: nothing to absorb");
  assert.equal(replayDelay(4000, 1000), 0, "very late (a refresh): show where it is");
});

test("slingshot flies opposite to the pull; tiny pulls do nothing; power caps at 1", () => {
  const b = { x: 100, y: 100 };
  const right = aimFromDrag(b, { x: 40, y: 100 });
  assert.ok(Math.abs(right.angle) < 1e-9);
  assert.ok(Math.abs(right.power - 60 / MAX_PULL) < 1e-9);
  const down = aimFromDrag(b, { x: 100, y: 40 });
  assert.ok(Math.abs(down.angle - Math.PI / 2) < 1e-9, "pull up, ball goes down (y grows downwards)");
  assert.equal(aimFromDrag(b, { x: 98, y: 100 }), null);
  assert.equal(aimFromDrag(b, { x: -500, y: 100 }).power, 1);
});

test("live counter adds finished holes; records text", async () => {
  assert.equal(runningStrokes(ball({ total: 3, strokes: 2 })), 5);
  const { makeT } = await import("../../src/i18n/dict.ts");
  assert.match(bestLine({}, makeT("ko")), /아직 기록이 없어요/);
  assert.equal(bestLine({ 3: 12, 9: 45 }, makeT("ko")), "우리 최고 기록 (둘이 합친 타수): 3홀 12타 · 9홀 45타");
  assert.equal(bestLine({ 3: 12 }, makeT("en")), "Our best (strokes together): 3 holes: 12");
});
