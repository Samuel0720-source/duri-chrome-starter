import test from "node:test";
import assert from "node:assert/strict";
import { ballAt, aimFromDrag, aimFromButtons, bestLine, ballLine, MAX_PULL } from "../../src/core/golf.ts";

const ball = (o = {}) => ({ x: 300, y: 100, strokes: 1, total: 0, holed: false, shotNo: 1, startedMs: 1000, untilMs: 2000, path: [[100, 100], [200, 100], [300, 100]], ...o });

test("a ball at rest stays at its stored place", () => {
  assert.deepEqual(ballAt(ball({ path: null, startedMs: null }), 5000), { x: 300, y: 100, moving: false });
  assert.deepEqual(ballAt(ball(), 2000), { x: 300, y: 100, moving: false });
});

test("replay walks the stored path on the shared clock", () => {
  assert.deepEqual(ballAt(ball(), 500), { x: 100, y: 100, moving: true }, "before the start: at the first point");
  assert.deepEqual(ballAt(ball(), 1500), { x: 200, y: 100, moving: true }, "halfway: middle point");
  assert.deepEqual(ballAt(ball(), 1250), { x: 150, y: 100, moving: true }, "quarter: between points");
});

test("two screens with the same data and clock agree to the pixel", () => {
  for (let t = 900; t <= 2100; t += 37) assert.deepEqual(ballAt(ball(), t), ballAt(ball(), t));
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

test("button aim and texts", () => {
  assert.deepEqual(aimFromButtons(90, 50), { angle: Math.PI / 2, power: 0.5 });
  assert.equal(aimFromButtons(0, 1).power, 0.05);
  assert.equal(aimFromButtons(0, 500).power, 1);
  assert.match(bestLine({}), /아직 기록이 없어요/);
  assert.equal(bestLine({ 1: 2, 3: 15 }), "우리의 기록: 1홀 최고 2타, 3홀 최고 15타");
  assert.equal(ballLine(ball({ holed: true, strokes: 3 }), 0), "3타로 컵인");
  assert.equal(ballLine(ball(), 1500), "1타, 굴러가는 중");
  assert.equal(ballLine(ball({ path: null, startedMs: null, strokes: 0 }), 0), "0타");
});
