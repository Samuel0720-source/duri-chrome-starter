import test from "node:test";
import assert from "node:assert/strict";
import { previewPath, readSelection } from "../../src/core/preview.ts";
import { validateOrigin } from "../../scripts/build-extension.mjs";

test("a web or compact link carries only the chosen date and timezone", () => {
  for (const path of ["/", "/compact"]) {
    const url = new URL(previewPath(path, "2024-02-29", "Asia/Seoul"), "https://example.org");
    assert.equal(url.pathname, path);
    assert.equal(url.search, "");
    assert.deepEqual(readSelection(url.hash), { start: "2024-02-29", zone: "Asia/Seoul" });
  }
  assert.equal(readSelection("#start=2025-02-29&zone=Asia/Seoul"), null);
  assert.equal(previewPath("/", "2024-02-29", "unknown"), "/");
  assert.equal(previewPath("/", "", "America/Vancouver"), "/");
});

test("extension builds use one intended HTTPS origin or a development loopback", () => {
  assert.equal(validateOrigin("https://example.org/"), "https://example.org");
  assert.equal(validateOrigin("http://localhost:3001"), "http://localhost:3001");
  for (const origin of ["http://example.org", "https://user@example.org", "https://example.org/room", "javascript:alert(1)", "https://example.org?invite=x"]) {
    assert.throws(() => validateOrigin(origin));
  }
});
