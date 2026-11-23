import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// A recorded session on the live site: two throwaway accounts play chess and number baseball
// back and forth, then draw together. Each browser keeps a video; screenshots mark each step.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
test.skip(!url || !secret, "Needs the test Supabase project credentials.");
const admin = createClient(url || "http://x", secret || "x", { auth: { persistSession: false } });
const made: string[] = [];
const contexts: BrowserContext[] = [];
test.afterAll(async () => {
  for (const c of contexts) await c.close(); // finishes the video files
  for (const id of made) await admin.auth.admin.deleteUser(id).catch(() => {});
});

async function signIn(browser: Browser, who: string, next: string): Promise<Page> {
  const email = `duri-demo-${who}-${randomUUID().slice(0, 6)}@example.com`;
  const { data: u, error: e1 } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (e1 || !u.user) throw e1;
  made.push(u.user.id);
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const ctx = await browser.newContext({ viewport: { width: 720, height: 900 }, recordVideo: { dir: `demo-out/video-${who}`, size: { width: 720, height: 900 } } });
  contexts.push(ctx);
  const page = await ctx.newPage();
  await page.goto("/auth/callback?" + new URLSearchParams({ token_hash: data.properties.hashed_token, type: "magiclink", next }));
  return page;
}

let shot = 0;
const snap = async (a: Page, b: Page, name: string) => {
  shot++;
  const n = String(shot).padStart(2, "0");
  await a.screenshot({ path: `demo-out/shots/${n}-${name}-A.png` });
  await b.screenshot({ path: `demo-out/shots/${n}-${name}-B.png` });
};

test("demo: two people play chess, number baseball and draw together", async ({ browser }) => {
  test.setTimeout(600_000);
  const a = await signIn(browser, "A", "/room");
  await a.getByLabel("함께한 첫날").fill("2026-06-23");
  await a.getByRole("button", { name: "방 만들기" }).click();
  await a.getByRole("button", { name: "초대 링크 만들기" }).click();
  const invite = new URL(await a.getByLabel("초대 링크").inputValue()).pathname;
  const b = await signIn(browser, "B", invite);
  await b.getByRole("button", { name: "방에 들어가기" }).click();
  await expect(b.getByText("두 사람이 모두 들어왔어요.")).toBeVisible();
  await a.reload();
  await snap(a, b, "room");

  // Chess: a new match by agreement, then Scholar's mate move by move.
  await Promise.all([a, b].map((p) => p.goto("/room/game?g=chess")));
  await a.getByRole("button", { name: "↻ 새 경기 요청", exact: true }).click();
  await b.getByRole("button", { name: "수락하고 시작", exact: true }).click({ timeout: 15_000 });
  for (const p of [a, b]) await expect(p.locator(".chess")).toHaveAttribute("data-status", "open", { timeout: 15_000 });
  const aWhite = (await a.locator(".chess-badge").last().getAttribute("data-color")) === "white";
  const [white, black] = aWhite ? [a, b] : [b, a];
  const moves: [Page, string, string, string][] = [
    [white, "e2", "e4", "e4"], [black, "e7", "e5", "e5"],
    [white, "f1", "c4", "Bc4"], [black, "b8", "c6", "Nc6"],
    [white, "d1", "h5", "Qh5"], [black, "g8", "f6", "Nf6"],
    [white, "h5", "f7", "Qxf7"],
  ];
  for (const [p, from, to, san] of moves) {
    const other = p === white ? black : white;
    await expect(p.locator(".chess")).toHaveAttribute("data-turn", /.+/);
    await p.locator(`.chess-sq[data-name="${from}"]`).click();
    await p.locator(`.chess-sq[data-name="${to}"]`).click();
    await expect(other.locator(".chess-move-list")).toContainText(to, { timeout: 15_000 });
    await expect(other.locator(`.chess-sq[data-name="${to}"]`)).toHaveAttribute("aria-label", new RegExp(`^${to} [A-Za-z]$`));
    console.log(`DEMO chess ${p === a ? "A" : "B"} ${from}-${to} (${san}) seen by the other side`);
    await p.waitForTimeout(700);
  }
  for (const p of [a, b]) await expect(p.locator(".chess")).toHaveAttribute("data-status", "won", { timeout: 15_000 });
  await expect(white.locator(".game-result")).toHaveAttribute("data-result", "win");
  await expect(black.locator(".game-result")).toHaveAttribute("data-result", "loss");
  console.log(`DEMO chess checkmate: ${white === a ? "A" : "B"} (white) wins`);
  await snap(a, b, "chess-mate");

  // Number baseball: secrets, five throws back and forth, the starter hits, the other uses the last chance.
  await Promise.all([a, b].map((p) => p.goto("/room/game?g=baseball")));
  await a.getByRole("button", { name: "↻ 새 경기 요청", exact: true }).click();
  await b.getByRole("button", { name: "수락하고 시작", exact: true }).click({ timeout: 15_000 });
  for (const p of [a, b]) await expect(p.locator(".bb-game")).toHaveAttribute("data-phase", "setup", { timeout: 15_000 });
  const pick = async (p: Page, digits: string) => {
    for (const d of digits) await p.locator(".bb-pad").getByRole("button", { name: d, exact: true }).click();
    await p.getByRole("button", { name: "이 숫자로 정하기" }).click();
  };
  await pick(a, "471");
  await pick(b, "028");
  for (const p of [a, b]) await expect(p.locator(".bb-game")).toHaveAttribute("data-phase", "playing", { timeout: 15_000 });
  const aStarts = (await a.locator(".bb-game").getAttribute("data-turn")) === "me";
  const [first, second] = aStarts ? [a, b] : [b, a];
  const firstTarget = aStarts ? "028" : "471", secondTarget = aStarts ? "471" : "028";
  const throws: [Page, string][] = [[first, "123"], [second, "147"], [first, "280"], [second, secondTarget], [first, firstTarget]];
  for (const [p, digits] of throws) {
    const other = p === first ? second : first;
    await expect(p.locator(".bb-game")).toHaveAttribute("data-turn", "me", { timeout: 15_000 });
    for (const d of digits) await p.locator(".bb-throw .bb-pad").getByRole("button", { name: d, exact: true }).click();
    await p.getByRole("button", { name: "⚾ 던지기" }).click();
    const row = other.getByTestId("bb-theirs").locator("li").last();
    await expect(row.locator(".bb-pill")).not.toHaveAttribute("data-kind", "wait", { timeout: 15_000 });
    console.log(`DEMO baseball ${p === a ? "A" : "B"} threw ${digits}: ${(await row.locator(".bb-pill").innerText()).replace(/\s+/g, " ")}`);
    await p.waitForTimeout(600);
  }
  for (const p of [a, b]) await expect(p.locator(".game-result")).toHaveAttribute("data-result", "tie", { timeout: 15_000 });
  console.log("DEMO baseball: both hit 3S in the same number of throws -> draw");
  await snap(a, b, "baseball-draw");

  // Shared drawing: A draws in one color, B in another; both canvases show both lines.
  await Promise.all([a, b].map((p) => p.goto("/room/draw")));
  const ink = (p: Page) => p.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>("[data-testid=sketch-canvas]")!;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n;
  });
  const stroke = async (p: Page, pts: [number, number][]) => {
    await p.getByTestId("sketch-canvas").scrollIntoViewIfNeeded();
    const box = (await p.getByTestId("sketch-canvas").boundingBox())!;
    await p.mouse.move(box.x + box.width * pts[0][0], box.y + box.height * pts[0][1]);
    await p.mouse.down();
    for (const [x, y] of pts.slice(1)) await p.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 8 });
    await p.mouse.up();
  };
  await expect(b.getByTestId("sketch-canvas")).toBeVisible();
  const start = await ink(b);
  const heart: [number, number][] = [[0.5, 0.35], [0.4, 0.22], [0.28, 0.3], [0.3, 0.45], [0.5, 0.65], [0.7, 0.45], [0.72, 0.3], [0.6, 0.22], [0.5, 0.35]];
  await stroke(a, heart);
  await expect.poll(() => ink(b), { timeout: 15_000 }).toBeGreaterThan(start + 200);
  const afterA = await ink(a);
  const swatches = b.locator(".swatches .swatch");
  await swatches.nth((await swatches.count()) - 1).click();
  await stroke(b, [[0.2, 0.8], [0.35, 0.75], [0.5, 0.82], [0.65, 0.75], [0.8, 0.8]]);
  await expect.poll(() => ink(a), { timeout: 15_000 }).toBeGreaterThan(afterA + 150);
  console.log(`DEMO drawing: A's heart and B's wave appear on both canvases (ink A ${await ink(a)}, B ${await ink(b)})`);
  await a.waitForTimeout(800);
  await snap(a, b, "drawing");
});
