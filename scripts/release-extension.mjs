// Builds the Chrome extension for the Chrome Web Store: production web address, checks, and a .zip.
//   npm run extension:release                       -> https://duri-chrome-starter.vercel.app
//   npm run extension:release https://duri.example  -> after a custom domain is connected
import { createHash } from "node:crypto";
import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import { buildExtension, validateOrigin } from "./build-extension.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const productionOrigin = "https://duri-chrome-starter.vercel.app";

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else out.push(full);
  }
  return out.sort();
}

// A small, standard ZIP writer (deflate), enough for a store upload.
export function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const dosTime = (0 << 11) | (0 << 5); // 00:00:00
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1; // fixed date: the same input gives the same zip
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const body = deflateRawSync(data, { level: 9 });
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10); central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// What the store review cares about, checked before anything is packed.
// The only pages the extension may run on: Netflix watch pages, and the 함께 보기 page of this web app.
export function allowedScriptPages(origin) {
  return new Set(["https://www.netflix.com/watch/*", origin + "/room/watch*"]);
}

export function checkManifest(manifest, files, origin = "https://duri.example") {
  const problems = [];
  if (manifest.manifest_version !== 3) problems.push("manifest_version must be 3");
  if (!/^\d+(\.\d+){0,3}$/.test(manifest.version ?? "")) problems.push("version must be 1-4 numbers");
  const allowed = new Set(["storage"]);
  for (const p of manifest.permissions ?? []) if (!allowed.has(p)) problems.push("unexpected permission: " + p);
  if (manifest.host_permissions?.length) problems.push("host_permissions are not needed");
  const pages = allowedScriptPages(origin);
  for (const script of manifest.content_scripts ?? []) {
    for (const match of script.matches ?? []) if (!pages.has(match)) problems.push("content script on an unexpected page: " + match);
    if (script.all_frames) problems.push("content scripts stay in the top frame");
  }
  if (manifest.background && Object.keys(manifest.background).join() !== "service_worker") problems.push("background must be one service worker");
  if (!manifest.default_locale) problems.push("default_locale is missing");
  for (const lang of ["en", "ko"]) if (!files.includes(`_locales/${lang}/messages.json`)) problems.push(`_locales/${lang}/messages.json is missing`);
  for (const size of ["16", "32", "48", "128"]) if (!manifest.icons?.[size]) problems.push("icon " + size + " is missing");
  return problems;
}

export async function releaseExtension(input = productionOrigin, outDir = join(root, "dist")) {
  const origin = validateOrigin(input);
  if (!origin.startsWith("https://")) throw new Error("A store build needs an https address, not " + origin);
  const directory = join(outDir, "chrome-extension-release");
  await rm(directory, { recursive: true, force: true });
  await buildExtension(origin, directory);
  const paths = await listFiles(directory);
  const names = paths.map((p) => relative(directory, p).split(sep).join("/"));
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
  const problems = checkManifest(manifest, names, origin);
  if (problems.length) throw new Error("Not ready for the store:\n- " + problems.join("\n- "));
  const entries = await Promise.all(paths.map(async (p, i) => ({ name: names[i], data: await readFile(p) })));
  const file = join(outDir, `duri-extension-${manifest.version}.zip`);
  const packed = zip(entries);
  await writeFile(file, packed);
  const sha256 = createHash("sha256").update(packed).digest("hex");
  return { file, origin, version: manifest.version, files: names, bytes: (await stat(file)).size, sha256 };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = await releaseExtension(process.argv[2] ?? productionOrigin);
  console.log(`Chrome Web Store upload: ${result.file}`);
  console.log(`web address ${result.origin} · version ${result.version} · ${result.files.length} files · ${result.bytes} bytes`);
  console.log(`sha256 ${result.sha256}`);
}
