import { test } from "node:test";
import assert from "node:assert/strict";
import { albumErrorKey, fitSize, isUuid, photoFile, photoUrl } from "../../src/core/album.ts";

test("pictures shrink to fit, keep their shape, and are never enlarged", () => {
  assert.deepEqual(fitSize(4032, 3024, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitSize(3024, 4032, 480), { width: 360, height: 480 });
  assert.deepEqual(fitSize(800, 600, 1600), { width: 800, height: 600 });
  assert.deepEqual(fitSize(10000, 1, 1600), { width: 1600, height: 1 });
  assert.throws(() => fitSize(0, 10, 1600));
});

test("file names, addresses and ids", () => {
  const room = "11111111-2222-4333-8444-555555555555";
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  assert.equal(photoFile(room, id), room + "/" + id + ".jpg");
  assert.equal(photoFile(room, id, true), room + "/" + id + "_t.jpg");
  assert.equal(photoUrl(id, true), "/api/photo/" + id + "?size=t");
  assert.equal(isUuid(id), true);
  assert.equal(isUuid("../etc/passwd"), false);
  assert.equal(isUuid(id.toUpperCase()), false);
  assert.equal(albumErrorKey("Album full"), "album.err.full");
  assert.equal(albumErrorKey("Photo unavailable"), "album.err.gone");
  assert.equal(albumErrorKey(undefined), "album.err.upload");
});
