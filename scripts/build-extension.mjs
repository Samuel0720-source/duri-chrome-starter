import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localOrigin = "http://localhost:3000";
const defaultDirectory = join(root, "dist", "chrome-extension");

export function validateOrigin(input) {
  const site = new URL(input);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname);
  const validScheme = site.protocol === "https:" || (loopback && site.protocol === "http:");
  if (!validScheme || site.username || site.password || site.pathname !== "/" || site.search || site.hash) {
    throw new Error("웹앱의 HTTPS 기본 주소(개발 시 localhost의 HTTP 주소)를 입력해 주세요.");
  }
  return site.origin;
}

export async function buildExtension(input = localOrigin, directory = defaultDirectory) {
  const origin = validateOrigin(input);
  await mkdir(join(directory, "core"), { recursive: true });
  await cp(join(root, "extension"), directory, { recursive: true });
  for (const name of ["dates", "preview"]) {
    const file = await readFile(join(root, "src", "core", name + ".ts"), "utf8");
    const { outputText } = ts.transpileModule(file, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        rewriteRelativeImportExtensions: true,
      },
      fileName: name + ".ts",
    });
    await writeFile(join(directory, "core", name + ".js"), outputText);
  }
  await writeFile(join(directory, "origin.js"), "export const webOrigin = " + JSON.stringify(origin) + ";\n");
  return directory;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const directory = await buildExtension(process.argv[2]);
  console.log("Chrome에서 불러올 폴더:", directory);
}
