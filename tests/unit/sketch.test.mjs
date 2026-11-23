import test from "node:test";
import assert from "node:assert/strict";
import {
  SKETCH_H, SKETCH_W, groupSketchPaths, isSketchBg, isSketchToken, isValidSketchStroke,
} from "../../src/core/sketch.ts";

test("isSketchBg and isSketchToken validate allowed paper themes and 64-hex bridge tokens", () => {
  assert.equal(isSketchBg("paper"), true);
  assert.equal(isSketchBg("night"), true);
  assert.equal(isSketchBg("other"), false);
  assert.equal(isSketchToken("0123456789abcdef".repeat(4)), true);
  assert.equal(isSketchToken("0123456789ABCDEF".repeat(4)), false);
  assert.equal(isSketchToken("short"), false);
});

test("isValidSketchStroke validates pen, erase, and stamp constraints", () => {
  assert.equal(isValidSketchStroke("pen", [[0, 0], [SKETCH_W, SKETCH_H]], "#6e304b", 9, null), true);
  assert.equal(isValidSketchStroke("erase", [[10, 20], [30, 40]], "#ffffff", 24, null), true);
  assert.equal(isValidSketchStroke("pen", [[SKETCH_W + 1, 10]], "#6e304b", 9, null), false);
  assert.equal(isValidSketchStroke("pen", [], "#6e304b", 9, null), false);
  assert.equal(isValidSketchStroke("pen", [[10, 10]], "red", 9, null), false);
  assert.equal(isValidSketchStroke("pen", [[10, 10]], "#6e304b", 99, null), false);
  assert.equal(isValidSketchStroke("stamp", [[120, 240]], "#2a1f26", 44, "❤️"), true);
  assert.equal(isValidSketchStroke("stamp", [[120, 240], [130, 250]], "#2a1f26", 44, "❤️"), false);
  assert.equal(isValidSketchStroke("stamp", [[120, 240]], "#2a1f26", 44, "💣"), false);
});

test("groupSketchPaths merges sequential segments of the same stroke while preserving order", () => {
  const rows = [
    { seq: 2, stroke: "s1", segment: "seg2", by: "me", kind: "pen", color: "#6e304b", width: 9, points: [[30, 40]], stamp: null },
    { seq: 1, stroke: "s1", segment: "seg1", by: "me", kind: "pen", color: "#6e304b", width: 9, points: [[10, 20]], stamp: null },
    { seq: 3, stroke: "s2", segment: "seg3", by: "partner", kind: "stamp", color: "#2a1f26", width: 44, points: [[100, 100]], stamp: "⭐" },
  ];
  const paths = groupSketchPaths(rows);
  assert.equal(paths.length, 2);
  assert.deepEqual(paths[0].points, [[10, 20], [30, 40]]);
  assert.equal(paths[1].stamp, "⭐");
});
