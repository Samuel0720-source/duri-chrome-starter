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

test("store screenshots", async ({ browser }) => {
  test.setTimeout(180_000);
  const a = await signIn(browser, "/room", "ko");
  await a.getByLabel("함께한 첫날").fill("2026-06-23");
  await a.getByRole("button", { name: "방 만들기" }).click();
  await a.getByRole("button", { name: "초대 링크 만들기" }).click();
  const invite = new URL(await a.getByLabel("초대 링크").inputValue()).pathname;
  const b = await signIn(browser, invite, "ko");
  await b.getByRole("button", { name: "방에 들어가기" }).click();
  await expect(b.getByText("두 사람이 모두 들어왔어요.")).toBeVisible();
  for (const [p, msg] of [[b, "오늘 저녁에 통화할래? 🙂"], [a, "좋아! 9시에 걸게"]] as const) {
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
  for (const lang of ["ko", "en"]) {
    await a.context().addCookies([{ name: "duri_lang", value: lang, url: process.env.FLOW_URL! }]);
    for (const [path, name] of [["/room", "home"], ["/room/chat", "chat"], ["/room/game?g=chess", "games"], ["/room/draw", "draw"]]) {
      await a.goto(path);
      await a.waitForLoadState("networkidle").catch(() => {});
      await a.waitForTimeout(800);
      await a.screenshot({ path: `demo-out/store/${lang}-${name}.png` });
    }
  }
});
