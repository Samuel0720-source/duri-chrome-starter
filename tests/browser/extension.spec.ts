import { expect, test, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { buildExtension } from "../../scripts/build-extension.mjs";

async function install(context: BrowserContext, unpacked: string) {
  const control = await context.browser()!.newBrowserCDPSession();
  try {
    return (await control.send("Extensions.loadUnpacked", { path: unpacked })).id;
  } catch (error) {
    const managed = String(error).includes("Loading of unpacked extensions is disabled by the administrator");
    test.skip(managed && process.env.REQUIRE_NATIVE_EXTENSION !== "1", "Chromium administrator policy blocks unpacked extensions.");
    throw error;
  }
}

// The legacy date-only window preserves links made by older extension versions.
test("old compact calendar links keep their date when opened in the full website", async ({ page, context, baseURL }) => {
  await page.goto("/compact#start=2024-02-29&zone=Asia%2FSeoul");
  await expect(page).toHaveURL(/\/compact\/calendar#/);
  await expect(page.getByLabel("함께한 첫날")).toHaveValue("2024-02-29");
  await expect(page.getByLabel("기준 시간대")).toHaveValue("Asia/Seoul");
  await page.getByLabel("함께한 첫날").fill("2025-03-14");
  const [full] = await Promise.all([
    context.waitForEvent("page"), page.getByRole("link", { name: "전체 웹앱 열기" }).click(),
  ]);
  await expect(full).toHaveURL(url => url.origin === new URL(baseURL!).origin && url.pathname === "/");
  await expect(full.getByLabel("함께한 첫날")).toHaveValue("2025-03-14");
  await expect(full.getByLabel("기준 시간대")).toHaveValue("Asia/Seoul");
});

test("packaged popup hosts the actual room and opens that screen outside the popup", async ({ context, page, baseURL }, testInfo) => {
  const unpacked = await buildExtension(baseURL, testInfo.outputPath("ui-build"));
  const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp" };
  const adapter = new URL("/__extension_test__/", baseURL).href;
  await context.route(adapter + "**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/__extension_test__/", "");
    if (!/^[a-zA-Z0-9_./-]+$/.test(path) || path.includes("..") || !mime[extname(path)]) return route.fulfill({ status: 404 });
    try { return route.fulfill({ body: await readFile(join(unpacked, path)), contentType: mime[extname(path)] }); }
    catch { return route.fulfill({ status: 404 }); }
  });
  await context.addInitScript(({ origin }) => {
    if (!location.pathname.startsWith("/__extension_test__/")) return;
    const openSmall = (path: string) => window.open(origin + path + (path.includes("?") ? "&" : "?") + "mini=1", "duri-small", "popup,width=460,height=680");
    const apis = {
      i18n: { getUILanguage: () => "ko" },
      storage: { local: {
        get: async (key: string | string[]) => Object.fromEntries((typeof key === "string" ? [key] : key).map(k => [k, JSON.parse(localStorage.getItem(k) ?? "null")])),
        set: async (entry: Record<string, unknown>) => { for (const [k, v] of Object.entries(entry)) localStorage.setItem(k, JSON.stringify(v)); },
      } },
      tabs: { create: async ({ url }: { url: string }) => window.open(url, "_blank") },
      runtime: { sendMessage: async (message: { duri: string; path: string }) => {
        if (message.duri === "open-small") { openSmall(message.path); return { ok: true }; }
      } },
    };
    const surface = window as Window & { chrome?: object };
    surface.chrome ??= {};
    Object.assign(surface.chrome, apis);
  }, { origin: new URL(baseURL!).origin });
  await page.goto(adapter + "popup.html");
  const frame = page.frameLocator("#app");
  await expect(page.locator("#app")).toHaveAttribute("src", new RegExp(new URL(baseURL!).origin.replaceAll(".", "\\.") + "/room"));
  await expect(frame.locator("main")).toBeVisible();
  const [full] = await Promise.all([context.waitForEvent("page"), page.locator("#full").click()]);
  await expect(full).toHaveURL(url => url.origin === new URL(baseURL!).origin && ["/room", "/login"].includes(url.pathname));
  const [small] = await Promise.all([context.waitForEvent("page"), page.locator("#detach").click()]);
  await expect(small).toHaveURL(url => url.origin === new URL(baseURL!).origin && (url.searchParams.get("mini") === "1" || url.pathname === "/login"));
  await page.locator("#reload").click();
  await expect(frame.locator("main")).toBeVisible();
});

test("native extension embeds the website with its chosen language and opens one reusable small window", async ({ playwright, baseURL }, testInfo) => {
  const unpacked = await buildExtension(baseURL, testInfo.outputPath("unpacked"));
  const context = await playwright.chromium.launchPersistentContext(testInfo.outputPath("profile"), {
    headless: true, channel: "chromium", locale: "en-CA", executablePath: process.env.CHROMIUM_PATH || undefined,
    ignoreDefaultArgs: ["--disable-extensions"], args: ["--enable-unsafe-extension-debugging"],
  });
  try {
    await context.addCookies([{ name: "duri_lang", value: "ko", url: baseURL! }]);
    const id = await install(context, unpacked);
    const popup = await context.newPage();
    await popup.goto("chrome-extension://" + id + "/popup.html");
    const embedded = popup.frameLocator("#app");
    await expect(embedded.locator("main")).toBeVisible();
    await expect(embedded.locator("html")).toHaveAttribute("lang", "ko");
    await expect(popup.locator("html")).toHaveAttribute("lang", "ko");
    const [full] = await Promise.all([context.waitForEvent("page"), popup.locator("#full").click()]);
    await expect(full.locator("html")).toHaveAttribute("lang", "ko");
    const background = (element: Element) => getComputedStyle(element).backgroundColor;
    expect(await embedded.locator("body").evaluate(background)).toBe(await full.locator("body").evaluate(background));
    const [small] = await Promise.all([context.waitForEvent("page"), popup.locator("#detach").click()]);
    await expect(small.locator("main")).toBeVisible();
    await expect(small.locator("html")).toHaveAttribute("lang", "ko");
    const count = context.pages().length;
    await popup.locator("#detach").click();
    await expect.poll(() => context.pages().length).toBe(count);
    await expect(small).not.toHaveURL(/^about:/);
    await context.addCookies([{ name: "duri_lang", value: "en", url: baseURL! }]);
    await popup.locator("#reload").click();
    await expect(embedded.locator("html")).toHaveAttribute("lang", "en");
    await expect(popup.locator("html")).toHaveAttribute("lang", "en");
  } finally { await context.close(); }
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
    await context.route(new URL("/room/watch?bridge=frame", baseURL).href, (r) => r.fulfill({ contentType: "text/html", body: DURI_STUB }));
    await context.route(new URL("/bridge-host", baseURL).href, (r) => r.fulfill({
      contentType: "text/html", body: '<iframe id="embedded-watch" src="/room/watch?bridge=frame"></iframe>',
    }));

    const nf = await context.newPage();
    await nf.goto("https://www.netflix.com/watch/81234567");
    const duri = await context.newPage();
    await duri.goto(new URL("/room/watch?bridge=1", baseURL).href);
    type Got = { type: string; netflix?: boolean; state?: number; time?: number; id?: string | null };
    const host = await context.newPage();
    await host.goto(new URL("/bridge-host", baseURL).href);
    const embedded = host.frameLocator("#embedded-watch");
    await expect(embedded.locator("html")).toBeAttached();
    const framed = () => embedded.locator("html").evaluate(() => (window as unknown as { __got: Got[] }).__got);
    const got = () => duri.evaluate(() => (window as unknown as { __got: Got[] }).__got);
    const calls = () => nf.evaluate(() => (window as unknown as { __calls: string[] }).__calls.join(","));
    const send = (cmd: string, sec?: number) =>
      duri.evaluate(([c, s]) => window.postMessage({ duri: "to-ext", type: "cmd", cmd: c, sec: s }, location.origin), [cmd, sec] as const);

    // The page learns that the extension is there and that a Netflix tab is linked, then gets its reports.
    await expect.poll(async () => (await got()).some((m) => m.type === "hello")).toBe(true);
    await expect.poll(async () => (await got()).some((m) => m.type === "link" && m.netflix)).toBe(true);
    await expect.poll(async () => (await got()).some((m) => m.type === "state" && m.state === 2 && m.id === "81234567")).toBe(true);
    await expect.poll(async () => (await framed()).some((m) => m.type === "hello")).toBe(true);
    await expect.poll(async () => (await framed()).some((m) => m.type === "link" && m.netflix)).toBe(true);
    // Commands reach Netflix's own player: seek in milliseconds, then play; the playing state comes back.
    await embedded.locator("html").evaluate(() => window.postMessage({ duri: "to-ext", type: "cmd", cmd: "seek", sec: 125 }, location.origin));
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
    await expect.poll(async () => (await framed()).at(-1)).toMatchObject({ type: "link", netflix: false });
  } finally {
    await context.close();
  }
});
