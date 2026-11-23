import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// How long the small window takes to show a two-person room, step by step, on the live site.
// It prints numbers instead of failing on them: network speed in CI varies.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
test.skip(!url || !secret, "Needs the test Supabase project credentials.");
const admin = createClient(url || "http://x", secret || "x", { auth: { persistSession: false } });
const made: string[] = [];
test.afterAll(async () => {
  for (const id of made) await admin.auth.admin.deleteUser(id).catch(() => {});
});

async function signIn(browser: Browser, next: string): Promise<Page> {
  const email = `duri-speed-${randomUUID().slice(0, 8)}@example.com`;
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (e1 || !u.user) throw e1;
  made.push(u.user.id);
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const page = await (await browser.newContext({ viewport: { width: 440, height: 600 } })).newPage();
  await page.goto("/auth/callback?" + new URLSearchParams({ token_hash: data.properties.hashed_token, type: "magiclink", next }));
  return page;
}

type Row = { label: string; auth: number; server: number; html: number; ready: number; live: number };

async function measure(page: Page, path: string, label: string): Promise<Row> {
  const t0 = Date.now();
  await page.goto(path);
  await expect(page.locator(".room")).toBeVisible();
  const ready = Date.now() - t0;
  // Only the home screen marks its realtime link; elsewhere -1.
  const live = await page.locator("html[data-room-live=on]").waitFor({ state: "attached", timeout: 20_000 }).then(() => Date.now() - t0, () => -1);
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    return { server: n.responseStart - n.requestStart, html: n.responseEnd - n.startTime, auth: n.serverTiming.find((x) => x.name === "auth")?.duration ?? -1 };
  });
  const row = { label, auth: Math.round(nav.auth), server: Math.round(nav.server), html: Math.round(nav.html), ready, live };
  console.log(`SPEED ${label.padEnd(12)} auth ${String(row.auth).padStart(4)}  server ${String(row.server).padStart(5)}  html ${String(row.html).padStart(5)}  ready ${String(ready).padStart(5)}  live ${String(live).padStart(5)}`);
  return row;
}

test("speed: the small window opening a two-person room", async ({ browser }) => {
  const a = await signIn(browser, "/room");
  await a.getByLabel("함께한 첫날").fill("2026-06-23");
  await a.getByRole("button", { name: "방 만들기" }).click();
  await a.getByRole("button", { name: "초대 링크 만들기" }).click();
  const invite = new URL(await a.getByLabel("초대 링크").inputValue()).pathname;
  const b = await signIn(browser, invite);
  await b.getByRole("button", { name: "방에 들어가기" }).click();
  await expect(b.getByText("두 사람이 모두 들어왔어요.")).toBeVisible();

  console.log("SPEED (ms) auth = sign-in refresh in proxy, server = first byte wait, html = page received, ready = room visible, live = realtime connected");
  const rows: Row[] = [];
  for (let i = 1; i <= 5; i++) rows.push(await measure(a, "/room", `/room #${i}`));
  rows.push(await measure(a, "/room/game?g=baseball", "/room/game"));
  // The page's own API calls during start-up.
  const api = await a.evaluate(async () => {
    const time = async (u: string, init?: RequestInit) => { const t = performance.now(); await fetch(u, init); return Math.round(performance.now() - t); };
    return {
      token: await time("/api/session/token", { headers: { "x-duri-surface": "popup" } }),
      login: await time("/login", { redirect: "manual" }),
    };
  });
  console.log(`SPEED api /api/session/token ${api.token}  /login ${api.login}`);
});
