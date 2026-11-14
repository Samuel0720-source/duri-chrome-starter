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
    // Tabs opened by the extension skip Playwright's locale emulation, so pin the web language like a Korean user who picked it.
    await context.addCookies([{ name: "duri_lang", value: "ko", url: baseURL! }]);
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


// A stand-in for a Netflix watch page: Netflix's player object, recording what it was asked to do.
const NETFLIX_STUB = `<!doctype html><title>stub</title><script>
  window.__calls = [];
  const p = { t: 0, paused: true, at: Date.now(),
    getCurrentTime() { return this.paused ? this.t : this.t + (Date.now() - this.at); },
    isPaused() { return this.paused; },
    play() { window.__calls.push("play"); this.at = Date.now(); this.paused = false; },
    pause() { window.__calls.push("pause"); this.t = this.getCurrentTime(); this.paused = true; },
    seek(ms) { window.__calls.push("seek:" + ms); this.t = ms; this.at = Date.now(); } };
  window.netflix = { appContext: { state: { playerApp: { getAPI: () => ({ videoPlayer: {
    getAllPlayerSessionIds: () => ["watch-1"], getVideoPlayerBySessionId: () => p } }) } } } };
</script>`;
// A stand-in for the 함께 보기 page: collects what the extension tells it.
const DURI_STUB = `<!doctype html><title>stub</title><script>
  window.__got = [];
  addEventListener("message", (e) => { if (e.data && e.data.duri === "from-ext") window.__got.push(e.data); });
  postMessage({ duri: "to-ext", type: "ping" }, location.origin);
</script>`;

test("Netflix together: the extension relays commands and playback between a Netflix tab and the watch page", async ({
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
    const control = await context.browser()!.newBrowserCDPSession();
    try {
      await control.send("Extensions.loadUnpacked", { path: unpacked });
    } catch (error) {
      const managed = String(error).includes("Loading of unpacked extensions is disabled by the administrator");
      test.skip(managed && process.env.REQUIRE_NATIVE_EXTENSION !== "1", "Chromium administrator policy blocks unpacked extensions.");
      throw error;
    }
    await context.route("https://www.netflix.com/watch/**", (r) => r.fulfill({ contentType: "text/html", body: NETFLIX_STUB }));
    await context.route(new URL("/room/watch?bridge=1", baseURL).href, (r) => r.fulfill({ contentType: "text/html", body: DURI_STUB }));
    await context.route(new URL("/room/chat?bridge=1", baseURL).href, (r) => r.fulfill({ contentType: "text/html", body: DURI_STUB }));

    const nf = await context.newPage();
    await nf.goto("https://www.netflix.com/watch/81234567");
    const duri = await context.newPage();
    await duri.goto(new URL("/room/watch?bridge=1", baseURL).href);
    type Got = { type: string; netflix?: boolean; state?: number; time?: number; id?: string | null };
    const got = () => duri.evaluate(() => (window as unknown as { __got: Got[] }).__got);
    const calls = () => nf.evaluate(() => (window as unknown as { __calls: string[] }).__calls.join(","));
    const send = (cmd: string, sec?: number) =>
      duri.evaluate(([c, s]) => window.postMessage({ duri: "to-ext", type: "cmd", cmd: c, sec: s }, location.origin), [cmd, sec] as const);

    // The page learns that the extension is there and that a Netflix tab is linked, then gets its reports.
    await expect.poll(async () => (await got()).some((m) => m.type === "hello")).toBe(true);
    await expect.poll(async () => (await got()).some((m) => m.type === "link" && m.netflix)).toBe(true);
    await expect.poll(async () => (await got()).some((m) => m.type === "state" && m.state === 2 && m.id === "81234567")).toBe(true);
    // Commands reach Netflix's own player: seek in milliseconds, then play; the playing state comes back.
    await send("seek", 125);
    await expect.poll(calls).toContain("seek:125000");
    await send("play");
    await expect.poll(calls).toContain("play");
    await expect.poll(async () => (await got()).some((m) => m.type === "state" && m.state === 1 && (m.time ?? 0) >= 125)).toBe(true);
    // Anything else is dropped on the way: unknown commands, negative or huge positions.
    await send("eval");
    await send("seek", -5);
    await send("seek", 1e9);
    await send("pause");
    await expect.poll(calls).toContain("pause");
    expect(await calls()).toBe("seek:125000,play,pause");
    // The bridge runs only on the 함께 보기 page, not on the rest of the site.
    const other = await context.newPage();
    await other.goto(new URL("/room/chat?bridge=1", baseURL).href);
    await other.waitForTimeout(1000);
    expect(await other.evaluate(() => (window as unknown as { __got: Got[] }).__got.length)).toBe(0);
    // Closing the Netflix tab tells the page the link is gone.
    await nf.close();
    await expect.poll(async () => (await got()).at(-1)).toMatchObject({ type: "link", netflix: false });
  } finally {
    await context.close();
  }
});
