import test from "node:test";
import assert from "node:assert/strict";
import { surfacePath } from "../../extension/surface-path.js";

test("compact handoff retains room screens but never external destinations or private URL data", () => {
  assert.equal(surfacePath("/room/game?g=draw&secret=hidden"), "/room/game?g=draw");
  assert.equal(surfacePath("/room/chat?token=hidden#private"), "/room/chat");
  assert.equal(surfacePath("/login?next=https://evil.example&token_hash=hidden"), "/login");
  for (const path of ["https://evil.example/room", "//evil.example/room", "/invite/private-code", "/auth/callback?code=private", "javascript:alert(1)"]) {
    assert.equal(surfacePath(path), "/room");
  }
  assert.equal(surfacePath("/room/game?g=chess&secret=hidden"), "/room/game?g=chess");
  for (const path of ["/room", "/room/draw", "/room/album", "/room/watch", "/room/settings", "/login/forgot"]) assert.equal(surfacePath(path), path);
});
