import test from "node:test";
import assert from "node:assert/strict";
import { ago, lastMineId, seenStatus, startsGroup } from "../../src/core/chat.ts";

const msgs = [{ id: 1, sender: "a" }, { id: 2, sender: "b" }, { id: 3, sender: "a" }, { id: -5, sender: "a" }];

test("read receipt: seen only when the partner read up to my last saved message", () => {
  assert.equal(lastMineId(msgs, "a"), 3, "the unsent -5 does not count");
  assert.equal(lastMineId(msgs, "c"), null);
  assert.equal(seenStatus(3, 3), "seen");
  assert.equal(seenStatus(3, 5), "seen");
  assert.equal(seenStatus(3, 2), "unseen");
  assert.equal(seenStatus(null, 9), "none");
});

test("how long ago", () => {
  assert.deepEqual(ago(100_000, 100_000 - 59_000), { key: "rel.now", n: 0 });
  assert.deepEqual(ago(100_000, 100_000 - 61_000), { key: "rel.min", n: 1 });
  assert.deepEqual(ago(10_000_000, 10_000_000 - 7_300_000), { key: "rel.hour", n: 2 });
  assert.deepEqual(ago(400_000_000, 400_000_000 - 3 * 86_400_000), { key: "rel.day", n: 3 });
  assert.deepEqual(ago(0, 5000), { key: "rel.now", n: 0 }, "a clock a little ahead is still 'just now'");
});

test("name label only where the sender changes", () => {
  assert.deepEqual(msgs.map((_, i) => startsGroup(msgs, i)), [true, true, true, false]);
});
