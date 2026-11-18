import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { buildExtension } from "../../scripts/build-extension.mjs";

try { process.loadEnvFile(".env.local"); } catch {}
const project = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
test.skip(!project || !secret, "The live extension flow needs the existing test Supabase project credentials.");

test("a signed-in couple can use chat, albums and settings in the native extension and small window", async ({ playwright, browser, baseURL }, testInfo) => {
  const origin = new URL(baseURL!).origin;
  const admin = createClient(project!, secret!, { auth: { persistSession: false, autoRefreshToken: false } });
  const made: string[] = [];
  const unpacked = await buildExtension(origin, testInfo.outputPath("extension"));
  const context = await playwright.chromium.launchPersistentContext(testInfo.outputPath("profile"), {
    baseURL: origin, headless: true, channel: "chromium", locale: "ko-KR",
    viewport: { width: 440, height: 600 },
    executablePath: process.env.CHROMIUM_PATH || undefined,
    ignoreDefaultArgs: ["--disable-extensions"], args: ["--enable-unsafe-extension-debugging", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });
  let partner: BrowserContext | undefined;
  let roomId: string | null = null;
  async function person(label: string) {
    const email = `duri-compact-${label}-${randomUUID()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) throw error ?? new Error("Could not create test account");
    made.push(data.user.id);
    return email;
  }
  async function signIn(page: Page, email: string, next: string) {
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error) throw error;
    await page.goto(origin + "/auth/callback?" + new URLSearchParams({ token_hash: data.properties.hashed_token, type: "magiclink", next }));
  }
  try {
    await context.addCookies([{ name: "duri_lang", value: "ko", url: origin }]);
    const control = await context.browser()!.newBrowserCDPSession();
    const { id } = await control.send("Extensions.loadUnpacked", { path: unpacked });
    const a = await context.newPage();
    await signIn(a, await person("a"), "/room");
    await a.getByLabel("함께한 첫날").fill("2026-06-23");
    await a.getByRole("button", { name: "방 만들기", exact: true }).click();
    await a.getByRole("button", { name: "초대 링크 만들기" }).click();
    const invite = new URL(await a.getByLabel("초대 링크").inputValue()).pathname;
    partner = await browser.newContext({ baseURL: origin, locale: "ko-KR" });
    const b = await partner.newPage();
    await signIn(b, await person("b"), invite);
    await b.getByRole("button", { name: "방에 들어가기", exact: true }).click();
    await expect(b.getByText("두 사람이 모두 들어왔어요.")).toBeVisible();
    await expect(a.getByText("두 사람이 모두 들어왔어요.")).toBeVisible();

    const popup = await context.newPage();
    await popup.goto("chrome-extension://" + id + "/popup.html");
    const app = popup.frameLocator("#app");
    await expect(app.getByText("두 사람이 모두 들어왔어요.")).toBeVisible();
    await expect(app.locator("html")).toHaveAttribute("lang", "ko");
    await expect(popup.locator("html")).toHaveAttribute("lang", "ko");
    await expect(app.locator(".room-tabs a")).toHaveCount(6);
    // The embedded page can obtain only its own short-lived access token, never a refresh token.
    const sessionCheck = await app.locator("html").evaluate(async () => {
      const response = await fetch("/api/session/token", { headers: { "X-Duri-Surface": "popup" } });
      const body = await response.json();
      return { status: response.status, cache: response.headers.get("cache-control"), access: typeof body.accessToken, refresh: "refresh_token" in body || "refreshToken" in body };
    });
    expect(sessionCheck).toMatchObject({ status: 200, access: "string", refresh: false });
    expect(sessionCheck.cache).toContain("no-store");
    expect((await context.request.get(origin + "/api/session/token")).status()).toBe(403);
    const guest = await browser.newContext({ baseURL: origin });
    try {
      const guestPage = await guest.newPage();
      await guestPage.goto("/login");
      expect(await guestPage.evaluate(async () => (await fetch("/api/session/token", { headers: { "X-Duri-Surface": "popup" } })).status)).toBe(401);
    } finally { await guest.close(); }


    // The same authenticated server actions and cookies work inside the extension frame.
    await app.getByRole("link", { name: "설정", exact: true }).click();
    await expect(app.locator("html")).toHaveAttribute("data-room-live", "on", { timeout: 15000 });
    roomId = await app.locator('input[name="room"]').first().inputValue();
    await app.locator('label.mood-option[data-mood="night"]').click();
    await app.getByRole("button", { name: "이 테마로 바꾸기" }).click();
    await expect(app.locator('.room[data-mood="night"]')).toHaveCount(1);
    await expect(popup.locator("body")).toHaveAttribute("data-mood", "night");

    await app.getByRole("link", { name: "대화", exact: true }).click();
    await expect(app.locator(".call-actions button").first()).toBeEnabled();
    await app.locator("#chat-input").fill("A message from the Duri toolbar");
    await app.getByRole("button", { name: "보내기", exact: true }).click();
    await b.goto("/room/chat");
    await expect(b.getByText("A message from the Duri toolbar", { exact: true })).toBeVisible();
    await expect(b.locator(".call-actions button").first()).toBeEnabled();
    await b.locator("#chat-input").fill("Your partner can reply here");
    await b.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(app.getByText("Your partner can reply here", { exact: true })).toBeVisible();

    // Upload through the actual embedded input, verify the partner sees it, then delete it.
    await app.getByRole("link", { name: "앨범", exact: true }).click();
    await expect(app.getByTestId("album-input")).toBeAttached();
    const png = await a.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 64; canvas.height = 48;
      const pen = canvas.getContext("2d")!;
      pen.fillStyle = "#e886a2"; pen.fillRect(0, 0, 64, 48);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await expect(app.locator("html")).toHaveAttribute("data-room-live", "on");
    await app.getByTestId("album-input").setInputFiles({ name: "compact.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await expect(app.locator(".album-tile img")).toHaveCount(1);
    await b.goto("/room/album");
    await expect(b.locator(".album-tile img")).toHaveCount(1);
    await app.locator(".album-tile").click();
    await app.getByRole("button", { name: "앨범에서 삭제", exact: true }).click();
    await app.getByRole("button", { name: "네, 삭제할게요", exact: true }).click();
    await expect(app.locator(".album-tile")).toHaveCount(0);

    await app.getByRole("link", { name: "게임", exact: true }).click();
    await expect(app.locator(".game-switch a")).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      await app.locator(".game-switch a").nth(i).click();
      await expect(app.locator(".game-switch a").nth(i)).toHaveAttribute("aria-current", "page");
      expect(await app.locator("html").evaluate(root => root.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await app.getByRole("link", { name: "함께 보기", exact: true }).click();
    await expect(app.locator(".watch")).toBeVisible();
    expect(await app.locator("html").evaluate(root => root.scrollWidth <= window.innerWidth)).toBe(true);
    await app.getByRole("link", { name: "설정", exact: true }).click();
    await app.locator("#lang").selectOption("en");
    await app.getByRole("button", { name: "언어 바꾸기" }).click();
    await expect(app.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(popup.locator("html")).toHaveAttribute("lang", "en");
    await app.getByRole("link", { name: "Chat", exact: true }).click();
    await expect(app.getByText("Your partner can reply here", { exact: true })).toBeVisible();
    await expect(app.getByRole("button", { name: "Video call", exact: true })).toBeEnabled();
    const [small] = await Promise.all([context.waitForEvent("page"), popup.locator("#detach").click()]);
    await expect(small).toHaveURL(url => url.pathname === "/room/chat" && url.searchParams.get("mini") === "1");
    await expect(small.getByText("Your partner can reply here", { exact: true })).toBeVisible();
    await expect(small.locator("html")).toHaveAttribute("lang", "en");
    await expect(small.locator('.room[data-mood="night"]')).toHaveCount(1);
    // A persistent small window keeps a real two-way video/audio session alive after the toolbar closes.
    await popup.close();
    await context.grantPermissions(["microphone", "camera"], { origin });
    await partner.grantPermissions(["microphone", "camera"], { origin });
    await b.goto("/room/chat");
    await expect(b.locator(".call-actions button").first()).toBeEnabled({ timeout: 10000 });
    await expect(small.getByRole("button", { name: "Video call", exact: true })).toBeEnabled({ timeout: 10000 });
    await small.getByRole("button", { name: "Video call", exact: true }).click();
    await expect(b.getByRole("button", { name: "받기", exact: true })).toBeVisible({ timeout: 15000 });
    await b.getByRole("button", { name: "받기", exact: true }).click();
    for (const screen of [small, b]) {
      await expect(screen.locator(".call-box video")).toHaveCount(2, { timeout: 30000 });
      await expect.poll(() => screen.evaluate(() => {
        const audio = document.querySelector<HTMLAudioElement>(".call-box audio");
        return Boolean(audio && !audio.paused && !audio.muted && audio.currentTime > 0.5);
      }), { timeout: 15000 }).toBe(true);
      expect(await screen.locator("html").evaluate(root => root.scrollWidth <= innerWidth)).toBe(true);
    }
    await small.getByRole("button", { name: "End call", exact: true }).click();
    await expect(b.locator(".call-box video")).toHaveCount(0);

  } finally {
    // Own temporary uploads and Auth users are cleaned even after an assertion failure.
    if (roomId) {
      const { data } = await admin.storage.from("room-photos").list(roomId);
      if (data?.length) await admin.storage.from("room-photos").remove(data.map(file => roomId + "/" + file.name));
    }
    for (const id of made) await admin.auth.admin.deleteUser(id);
    await partner?.close();
    await context.close();
  }
});
