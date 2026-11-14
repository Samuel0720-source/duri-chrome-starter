import { expect, test, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { buildExtension } from "../../scripts/build-extension.mjs";

async function checkCalendarHandoff(context: BrowserContext, popupURL: string, web: string) {
  const popup = await context.newPage();
  await popup.goto(popupURL);
  await popup.getByLabel("함께한 첫날").fill("2024-02-29");
  await popup.getByLabel("기준 시간대").selectOption("Asia/Seoul");
  await expect(popup.getByRole("status")).toContainText("일");
  await popup.getByLabel("이 기기에 날짜와 시간대 기억").check();
  await expect(popup.getByRole("status")).toContainText("일째");
  await expect(popup.getByRole("button", { name: "작은 창으로 열기" })).toHaveCount(0);
  const webRoot = (url: URL) => url.origin === new URL(web).origin && url.pathname === "/";
  const [full] = await Promise.all([
    context.waitForEvent("page"),
    popup.getByRole("button", { name: "전체 웹앱" }).click(),
  ]);
  await expect(full).toHaveURL(webRoot);
  await expect(full.getByLabel("함께한 첫날")).toHaveValue("2024-02-29");
  await expect(full.getByLabel("기준 시간대")).toHaveValue("Asia/Seoul");

  // The compact web page still exists for the installed app and links to the full app.
  const small = await context.newPage();
  await small.goto(new URL("/compact#start=2024-02-29&zone=Asia%2FSeoul", web).href);
  await small.getByLabel("함께한 첫날").fill("2025-03-14");
  const [fromSmall] = await Promise.all([
    context.waitForEvent("page"),
    small.getByRole("link", { name: "전체 웹앱 열기" }).click(),
  ]);
  await expect(fromSmall).toHaveURL(webRoot);
  await expect(fromSmall.getByLabel("함께한 첫날")).toHaveValue("2025-03-14");

  const reopened = await context.newPage();
  await reopened.goto(popupURL);
  // A saved date shows the result first; settings stay folded until opened.
  await expect(reopened.getByLabel("함께한 첫날")).toBeHidden();
  await reopened.getByText("날짜 설정").click();
  await expect(reopened.getByLabel("함께한 첫날")).toHaveValue("2024-02-29");
  await reopened.getByLabel("이 기기에 날짜와 시간대 기억").uncheck();
  const [direct] = await Promise.all([
    context.waitForEvent("page"),
    reopened.getByRole("button", { name: "전체 웹앱" }).click(),
  ]);
  await expect(direct).toHaveURL(webRoot);
  await expect(direct.getByLabel("함께한 첫날")).toHaveValue("2024-02-29");
  const forgotten = await context.newPage();
  await forgotten.goto(popupURL);
  await expect(forgotten.getByLabel("함께한 첫날")).toBeEnabled();
  await expect(forgotten.getByLabel("함께한 첫날")).toBeEmpty();
}

test("packaged popup UI and real website preserve inputs across windows, using a browser-API test adapter", async ({
  context, baseURL,
}, testInfo) => {
  const unpacked = await buildExtension(baseURL, testInfo.outputPath("ui-build"));
  const mime: Record<string, string> = {
    ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png",
  };
  // Serve actual packaged files, only inside this test's browser context.
  await context.route("http://popup.test/**", async (route) => {
    const path = new URL(route.request().url()).pathname.slice(1);
    if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.includes("..") || !mime[extname(path)]) {
      return route.fulfill({ status: 404 });
    }
    try {
      const body = await readFile(join(unpacked, path));
      await route.fulfill({ body, contentType: mime[extname(path)] });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
  await context.addInitScript(() => {
    if (location.hostname !== "popup.test") return;
    const apis = {
      storage: { local: {
        get: async (key: string) => ({ [key]: localStorage.getItem(key) }),
        set: async (entry: Record<string, string>) => {
          for (const [key, value] of Object.entries(entry)) localStorage.setItem(key, value);
        },
        remove: async (key: string) => localStorage.removeItem(key),
      } },
      windows: {
        create: async ({ url, width, height }: { url: string; width: number; height: number }) =>
          window.open(url, "_blank", "popup,width=" + width + ",height=" + height),
      },
      tabs: { create: async ({ url }: { url: string }) => window.open(url, "_blank") },
    };
    const surface = window as Window & { chrome?: object };
    surface.chrome ??= {};
    Object.assign(surface.chrome, apis);
  });
  await checkCalendarHandoff(context, "http://popup.test/popup.html", baseURL!);
});

test("unpacked Chrome extension passes the same scenario via native extension APIs", async ({
  playwright, baseURL,
}, testInfo) => {
  const unpacked = await buildExtension(baseURL, testInfo.outputPath("unpacked"));
  const context = await playwright.chromium.launchPersistentContext(testInfo.outputPath("profile"), {
    headless: true,
    channel: "chromium",
    locale: "ko-KR",
    executablePath: process.env.CHROMIUM_PATH || undefined,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging"],
  });
  try {
    // DevTools installs only our local build in this disposable Chromium profile.
    const control = await context.browser()!.newBrowserCDPSession();
    let id: string;
    try {
      ({ id } = await control.send("Extensions.loadUnpacked", { path: unpacked }));
    } catch (error) {
      const managed = String(error).includes("Loading of unpacked extensions is disabled by the administrator");
      test.skip(managed && process.env.REQUIRE_NATIVE_EXTENSION !== "1", "Chromium administrator policy blocks unpacked extensions. Run this check in an unmanaged test browser.");
      throw error;
    }
    await checkCalendarHandoff(context, "chrome-extension://" + id + "/popup.html", baseURL!);
  } finally {
    await context.close();
  }
});

