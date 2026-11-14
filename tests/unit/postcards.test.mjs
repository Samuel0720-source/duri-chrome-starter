import test from "node:test";
import assert from "node:assert/strict";
import { postcardBoard, postcardQuestion } from "../../src/core/postcards.ts";

test("both partners get the same six pairs and a new question on consecutive room days", () => {
  const today = "2026-11-14", next = "2026-11-15";
  const faces = postcardBoard(today);
  assert.deepEqual(faces, postcardBoard(today));
  assert.notDeepEqual(faces, postcardBoard(next));
  assert.equal(new Set(faces).size, 6);
  for (const face of faces) assert.equal(faces.filter(f => f === face).length, 2);
  assert.notEqual(postcardQuestion(today), postcardQuestion(next));
});
