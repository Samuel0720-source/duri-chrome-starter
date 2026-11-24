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

for (const lang of ["en", "ko"]) {
  test(`store screenshots (${lang})`, async ({ browser }) => {
    const a = await signIn(browser, "/room", lang);
    await a.locator("input[type=date]").first().fill("2026-06-23");
    await a.locator("form button[type=submit]").first().click();
    await a.locator("form button[type=submit]").first().click();
    const invite = new URL(await a.locator("input[readonly]").first().inputValue()).pathname;
    const b = await signIn(browser, invite, lang);
    await b.locator("form button[type=submit]").first().click();
    await b.waitForURL(/\/room/);
    // A short chat so the Chat screen is not empty.
    for (const [p, msg] of [[b, lang === "ko" ? "오늘 저녁에 통화할래? 🙂" : "Call tonight? 🙂"], [a, lang === "ko" ? "좋아! 9시에 걸게" : "Yes! I'll call at 9"]] as const) {
      await p.goto("/room/chat");
      await p.locator("textarea, input[type=text]").last().fill(msg);
      await p.keyboard.press("Enter");
      await expect(p.getByText(msg).first()).toBeVisible();
    }
    for (const [path, name] of [["/room", "home"], ["/room/chat", "chat"], ["/room/game?g=chess", "games"]]) {
      await a.goto(path);
      await a.waitForLoadState("networkidle").catch(() => {});
      await a.waitForTimeout(800);
      await a.screenshot({ path: `demo-out/store/${lang}-${name}.png` });
    }
  });
}
