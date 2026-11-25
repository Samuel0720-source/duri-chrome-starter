import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Chrome Web Store screenshots: the live app at the popup's size (440×600), two people in one room.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
test.skip(!url || !secret, "Needs the test Supabase project credentials.");
const admin = createClient(url || "http://x", secret || "x", { auth: { persistSession: false } });
const made: string[] = [];
test.afterAll(async () => { for (const id of made) await admin.auth.admin.deleteUser(id).catch(() => {}); });

async function signIn(browser: Browser, next: string, lang: string): Promise<Page> {
  const email = `duri-shot-${randomUUID().slice(0, 6)}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({ email, email_confirm: true });
  made.push(u.user!.id);
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const ctx = await browser.newContext({ viewport: { width: 440, height: 600 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "duri_lang", value: lang, url: process.env.FLOW_URL! }]);
  const page = await ctx.newPage();
  await page.goto("/auth/callback?" + new URLSearchParams({ token_hash: data!.properties.hashed_token, type: "magiclink", next }));
  return page;
}

for (const lang of ["en", "ko"]) test(`store screenshots (${lang})`, async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await signIn(browser, "/room", "ko");
  await a.getByLabel("함께한 첫날").fill("2026-06-23");
  await a.getByRole("button", { name: "방 만들기" }).click();
  await a.getByRole("button", { name: "초대 링크 만들기" }).click();
  const invite = new URL(await a.getByLabel("초대 링크").inputValue()).pathname;
  const b = await signIn(browser, invite, "ko");
  await b.getByRole("button", { name: "방에 들어가기" }).click();
  await expect(b.getByText("두 사람이 모두 들어왔어요.")).toBeVisible();
  const chat = lang === "ko" ? ["오늘 저녁에 통화할래? 🙂", "좋아! 9시에 걸게"] : ["Call tonight? 🙂", "Yes! I'll call you at 9"];
  for (const [p, msg] of [[b, chat[0]], [a, chat[1]]] as const) {
    await p.goto("/room/chat");
    const box = p.getByRole("textbox").last();
    await box.fill(msg);
    await box.press("Enter");
    await expect(p.getByText(msg).first()).toBeVisible({ timeout: 15_000 });
  }
  // A chess game a few moves in, so the Games screen shows a live board.
  await Promise.all([a, b].map((p) => p.goto("/room/game?g=chess")));
  await a.getByRole("button", { name: "↻ 새 경기 요청", exact: true }).click();
  await b.getByRole("button", { name: "수락하고 시작", exact: true }).click({ timeout: 15_000 });
  for (const p of [a, b]) await expect(p.locator(".chess")).toHaveAttribute("data-status", "open", { timeout: 15_000 });
  const aWhite = (await a.locator(".chess-badge").last().getAttribute("data-color")) === "white";
  const [white, black] = aWhite ? [a, b] : [b, a];
  for (const [p, from, to] of [[white, "e2", "e4"], [black, "e7", "e5"], [white, "g1", "f3"], [black, "b8", "c6"]] as const) {
    await p.locator(`.chess-sq[data-name="${from}"]`).click();
    await p.locator(`.chess-sq[data-name="${to}"]`).click();
    await expect((p === white ? black : white).locator(".chess-move-list")).toContainText(to, { timeout: 15_000 });
  }
  // A little heart on the shared board, drawn by A.
  await a.goto("/room/draw");
  const canvas = a.locator("canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, r = Math.min(box.width, box.height) / 5;
  await a.mouse.move(cx, cy - (5 / 16) * r * 1.3);
  await a.mouse.down();
  for (let i = 0; i <= 60; i++) {
    const t = (i / 60) * 2 * Math.PI;
    const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    await a.mouse.move(cx + (x / 16) * r * 1.3, cy - (y / 16) * r * 1.3, { steps: 2 });
  }
  await a.mouse.up();
  await a.waitForTimeout(1500);
  {
    await a.context().addCookies([{ name: "duri_lang", value: lang, url: process.env.FLOW_URL! }]);
    for (const [path, name] of [["/room", "home"], ["/room/chat", "chat"], ["/room/game?g=chess", "games"], ["/room/draw", "draw"]]) {
      await a.goto(path);
      await a.waitForLoadState("networkidle").catch(() => {});
      await a.waitForTimeout(800);
      const focus = name === "games" ? ".chess-board" : name === "draw" ? "canvas" : null;
      if (focus) await a.locator(focus).first().evaluate((el) => window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 118)));
      await a.waitForTimeout(300);
      await a.screenshot({ path: `demo-out/store/${lang}-${name}.png` });
    }
  }
});
