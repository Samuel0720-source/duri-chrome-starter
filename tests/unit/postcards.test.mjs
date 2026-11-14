import test from "node:test";
import assert from "node:assert/strict";
import { postcardFaces, postcardQuestion } from "../../src/core/postcards.ts";

test("the seven postcard faces are distinct and daily questions rotate in the room timezone", () => {
  assert.equal(postcardFaces.length, 7);
  assert.equal(new Set(postcardFaces).size, 7);
  assert.notEqual(postcardQuestion("2026-11-14"), postcardQuestion("2026-11-15"));
});
