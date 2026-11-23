import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { checkManifest, releaseExtension } from "../../scripts/release-extension.mjs";

// Reads a zip's central directory back, so the test checks what the store would unpack.
function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const size = buf.readUInt32LE(at + 20), nameLen = buf.readUInt16LE(at + 28), extra = buf.readUInt16LE(at + 30), comment = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    const lnameLen = buf.readUInt16LE(local + 26), lextra = buf.readUInt16LE(local + 28);
    files[name] = inflateRawSync(buf.subarray(local + 30 + lnameLen + lextra, local + 30 + lnameLen + lextra + size));
    at += 46 + nameLen + extra + comment;
  }
  return files;
}

test("store build: production https address, scoped Duri access, both languages, a valid zip", async () => {
  const out = await mkdtemp(join(tmpdir(), "duri-release-"));
  const r = await releaseExtension("https://duri.example", out);
  assert.match(r.file, /duri-extension-0\.5\.1\.zip$/);
  const files = unzip(await readFile(r.file));
  assert.equal(files["origin.js"].toString(), 'export const webOrigin = "https://duri.example";\n');
  const manifest = JSON.parse(files["manifest.json"].toString());
  assert.equal(manifest.action.default_popup, undefined);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(JSON.parse(files["_locales/en/messages.json"]).name.message, "Duri");
  assert.equal(JSON.parse(files["_locales/ko/messages.json"]).name.message, "둘이");
  for (const f of ["popup.html", "popup.js", "icons/postbirds.webp", "core/dates.js", "core/preview.js", "icons/128.png", "background.js", "netflix-player.js", "netflix-bridge.js", "duri-bridge.js"]) assert.ok(files[f], f);
  // Netflix together: scripts only on Netflix watch pages and on this site's 함께 보기 page.
  assert.deepEqual(manifest.content_scripts.flatMap((c) => c.matches), ["https://www.netflix.com/watch/*", "https://www.netflix.com/watch/*", "https://duri.example/room/watch*", "https://duri.example/*"]);
  assert.deepEqual(manifest.host_permissions, ["https://duri.example/*"]);
  assert.equal(manifest.background.type, "module");
  for (const f of ["app-bridge.js", "surface-path.js", "tokens.css", "art/mascots/night.webp"]) assert.ok(files[f], f);
  await assert.rejects(releaseExtension("http://localhost:3000", out), /https address/);
});

test("the store checks catch what review would reject", () => {
  const ok = { manifest_version: 3, version: "0.2.0", permissions: ["storage"], host_permissions: ["https://duri.example/*"], default_locale: "en", icons: { 16: 1, 32: 1, 48: 1, 128: 1 } };
  const files = ["_locales/en/messages.json", "_locales/ko/messages.json"];
  assert.deepEqual(checkManifest(ok, files), []);
  assert.deepEqual(checkManifest({ ...ok, permissions: ["storage", "tabs"] }, files), ["unexpected permission: tabs"]);
  assert.ok(checkManifest({ ...ok, host_permissions: ["<all_urls>"] }, files).length === 1);
  assert.ok(checkManifest(ok, ["_locales/en/messages.json"]).some((p) => p.includes("ko")));
  const script = (matches) => ({ ...ok, content_scripts: [{ matches, js: ["a.js"] }] });
  assert.deepEqual(checkManifest(script(["https://www.netflix.com/watch/*", "https://duri.example/room/watch*"]), files, "https://duri.example"), []);
  assert.deepEqual(checkManifest(script(["<all_urls>"]), files, "https://duri.example"), ["content script on an unexpected page: <all_urls>"]);
  assert.equal(checkManifest(script(["https://other.example/room/watch*"]), files, "https://duri.example").length, 1);
});
