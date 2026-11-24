import { test, expect, type CDPSession } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { buildExtension } from "../../scripts/build-extension.mjs";
try { process.loadEnvFile(".env.local"); } catch {}
const project = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
test.skip(!project || !secret, "Live authenticated test credentials are required.");

// Inspect the real offscreen frame via DevTools, without adding a diagnostic API
// or extra extension permissions to the distributed product.
async function inspectHost(control: CDPSession, origin: string) {
  let targetId = "";
  await expect.poll(async () => {
    const { targetInfos } = await control.send("Target.getTargets");
    targetId = targetInfos.find(t => t.url === origin + "/call-host")?.targetId ?? "";
    return !!targetId;
  }, { timeout: 20000 }).toBe(true);
  const { sessionId } = await control.send("Target.attachToTarget", { targetId, flatten: false });
  let sequence = 0;
  return (expression: string) => new Promise<any>((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { control.off("Target.receivedMessageFromTarget", receive); reject(new Error("Host inspection timed out")); }, 5000);
    const receive = (event: { sessionId: string; message: string }) => {
      if (event.sessionId !== sessionId) return;
      const data = JSON.parse(event.message);
      if (data.id !== id) return;
      clearTimeout(timer); control.off("Target.receivedMessageFromTarget", receive);
      if (data.error || data.result?.exceptionDetails) reject(new Error(JSON.stringify(data.error ?? data.result.exceptionDetails)));
      else resolve(data.result.result.value);
    };
    control.on("Target.receivedMessageFromTarget", receive);
    void control.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, returnByValue: true, awaitPromise: true } }) }).catch(reject);
  });
}

test("toolbar call stays in place, survives closing/reopening, and releases media on hangup", async ({ playwright, browser, baseURL }, info) => {
  const origin = new URL(baseURL!).origin;
  const admin = createClient(project!, secret!, { auth: { persistSession: false, autoRefreshToken: false } });
  const made: string[] = [];
  const unpacked = await buildExtension(origin, info.outputPath("extension"));
  const context = await playwright.chromium.launchPersistentContext(info.outputPath("profile"), {
    headless: true, channel: "chromium", viewport: null,
    ignoreDefaultArgs: ["--disable-extensions"],
    args: ["--enable-unsafe-extension-debugging", "--site-per-process", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  const partner = await browser.newContext({ baseURL: origin, permissions: ["camera", "microphone"] });
  async function login(page: import("@playwright/test").Page, next: string) {
    const email = `duri-toolbar-${randomUUID()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) throw error ?? Error("Test account creation failed");
    made.push(data.user.id);
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) throw link.error;
    await page.goto(origin + "/auth/callback?" + new URLSearchParams({ token_hash: link.data.properties.hashed_token, type: "magiclink", next }));
  }
  try {
    await context.grantPermissions(["microphone", "camera"], { origin });
    await context.addCookies([{ name: "duri_lang", value: "en", url: origin }]);
    await partner.addCookies([{ name: "duri_lang", value: "en", url: origin }]);
    const control = await context.browser()!.newBrowserCDPSession();
    const { id } = await control.send("Extensions.loadUnpacked", { path: unpacked });
    const a = await context.newPage(), b = await partner.newPage();
    await login(a, "/room");
    await a.locator('input[type="date"]').fill("2026-06-23");
    await a.getByRole("button", { name: "Create room", exact: true }).click();
    await a.getByRole("button", { name: "Create invite link", exact: true }).click();
    const invite = new URL(await a.getByLabel("Invite link", { exact: true }).inputValue()).pathname;
    await login(b, invite);
    await b.getByRole("button", { name: "Join the room", exact: true }).click();
    await b.goto(origin + "/room/chat");
    let popup = await context.newPage();
    const open = async () => {
      await popup.setViewportSize({ width: 440, height: 600 });
      await popup.goto("chrome-extension://" + id + "/popup.html");
      const app = popup.frameLocator("#app");
      await app.locator('.room-tabs a[href="/room/chat"]').click();
      return app;
    };
    let app = await open();
    await expect(app.getByRole("button", { name: "Video call", exact: true })).toBeEnabled({ timeout: 20000 });
    await expect(app.locator(".popup-call-launch")).toHaveCount(0);
    const windows = () => popup.evaluate("chrome.windows.getAll({windowTypes:['popup']})");
    expect(await windows()).toEqual([]);
    await app.getByRole("button", { name: "Video call", exact: true }).click();
    await expect(b.getByRole("button", { name: "Accept", exact: true })).toBeVisible({ timeout: 15000 });
    await b.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(app.locator('.call-box[data-phase="connected"]')).toBeVisible({ timeout: 30000 });
    await expect(app.locator(".call-box video")).toHaveCount(2, { timeout: 15000 });
    for (const label of ["Your camera", "Partner video"]) await expect.poll(() => app.getByLabel(label).evaluate((v: HTMLVideoElement) => v.videoWidth > 0 && v.currentTime > 0)).toBe(true);
    expect(await windows()).toEqual([]);
    const inspect = await inspectHost(control, origin);
    const audioState = `(() => { const a=document.querySelector('audio'); const s=a?.srcObject; return {id:s?.id, playing:!!a&&!a.paused&&!a.muted&&a.currentTime>0.5, time:a?.currentTime, live:s?.getAudioTracks()[0]?.readyState}; })()`;
    await expect.poll(async () => (await inspect(audioState)).playing, { timeout: 15000 }).toBe(true);
    const initial = await inspect(audioState);
    await expect.poll(() => b.locator(".call-box audio").evaluate((a: HTMLAudioElement) => !a.paused && a.currentTime > .5)).toBe(true);
    await app.getByRole("button", { name: "Mute microphone", exact: true }).click();
    await expect(app.getByRole("button", { name: "Unmute microphone", exact: true })).toHaveAttribute("aria-pressed", "true");
    await popup.close();
    await a.bringToFront();
    await expect.poll(async () => (await inspect(audioState)).time).toBeGreaterThan(initial.time + 2);
    expect((await inspect(audioState)).id).toBe(initial.id);
    popup = await context.newPage(); app = await open();
    await expect(app.getByRole("button", { name: "Unmute microphone", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(app.locator(".call-box video")).toHaveCount(2, { timeout: 15000 });
    await app.getByRole("button", { name: "Unmute microphone", exact: true }).click();
    for (const path of ["game", "draw", "album", "chat"]) {
      await app.locator(`.room-tabs a[href="/room/${path}"]`).click();
      await expect(app.getByRole("button", { name: "End call", exact: true })).toBeVisible();
      expect((await inspect(audioState)).id).toBe(initial.id);
    }
    // Chat is usable even with both previews and call controls in this 440×600 popup.
    await expect.poll(() => app.locator('#chat-input').evaluate(el => {
      const r=el.getBoundingClientRect(); return r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;
    })).toBe(true);
    await expect(app.locator('html')).toHaveAttribute('data-room-live', 'on');
    await app.locator('#chat-input').fill('Still here during our call');
    await expect(app.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
    await app.locator('#chat-input').press('Enter');
    await expect(app.locator('.bubble').last()).toContainText('Still here during our call');
    await expect(app.locator('[data-state="sending"]')).toHaveCount(0, { timeout: 15000 });
    console.log('Chat delivery errors:', await app.locator('.chat .error').allTextContents());
    await expect(app.locator('[data-state="failed"]')).toHaveCount(0); 
    await expect(b.getByText('Still here during our call', { exact: false })).toBeVisible({ timeout: 15000 });
    await app.getByRole("button", { name: "End call", exact: true }).click();
    await expect.poll(async () => (await inspect(audioState)).live).toBeUndefined();
    await expect(b.locator(".call-box audio")).toHaveCount(0);
    // Incoming voice call can be accepted in the same toolbar; logout ends it cleanly.
    await b.getByRole("button", { name: "Voice call", exact: true }).click();
    await app.getByRole("button", { name: "Accept", exact: true }).click();
    await expect.poll(async () => (await inspect(audioState)).playing, { timeout: 30000 }).toBe(true);
    expect(await windows()).toEqual([]);
    await app.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(b.locator(".call-box audio")).toHaveCount(0, { timeout: 15000 });
  } finally {
    await context.close(); await partner.close();
    for (const id of made) await admin.auth.admin.deleteUser(id);
  }
});
