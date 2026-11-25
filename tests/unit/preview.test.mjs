import test from "node:test";
import assert from "node:assert/strict";
import { isZone, previewPath, readSelection } from "../../src/core/preview.ts";
import { zoneLabel, zoneOptions } from "../../src/core/zones.ts";
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

test("every real time zone is accepted and named properly, west to east", () => {
  for (const zone of ["America/Toronto", "America/Vancouver", "Asia/Seoul", "Europe/London", "UTC"]) assert.ok(isZone(zone), zone);
  for (const zone of ["", "unknown", "Mars/Base", "../x", "Asia/Seoul; drop"]) assert.ok(!isZone(zone), zone);
  assert.deepEqual(readSelection("#start=2024-02-29&zone=Europe/Paris"), { start: "2024-02-29", zone: "Europe/Paris" });
  const winter = new Date("2026-01-15T12:00:00Z");
  assert.equal(zoneLabel("America/Toronto", "en", winter), "(UTC-05:00) Eastern Time · Toronto");
  assert.equal(zoneLabel("Asia/Seoul", "ko", winter), "(UTC+09:00) 한국 표준시 · Seoul");
  const all = zoneOptions("en", ["UTC"]);
  assert.ok(all.length > 300, "the whole world, not three cities");
  assert.ok(all.some((o) => o.value === "UTC"), "a saved zone missing from the list is kept");
  assert.ok(all.findIndex((o) => o.value === "America/Vancouver") < all.findIndex((o) => o.value === "Asia/Seoul"));
});
