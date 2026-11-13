import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Load .env.local into this test process (Next.js only loads it for the app).
try { process.loadEnvFile(".env.local"); } catch {}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

test.skip(!url || !secret, "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");

// The admin client makes throwaway users, so no Google and no real mailbox are needed.
// `||` (not `??`): an empty string from an unset CI secret must also fall back, so the skip above applies.
const admin: SupabaseClient = createClient(url || "http://x", secret || "x", {
  auth: { persistSession: false, autoRefreshToken: false },
});
const made: string[] = [];

async function makeUser(label: string) {
  const email = `duri-flow-${label}-${randomUUID().slice(0, 8)}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  made.push(data.user.id);
  return { id: data.user.id, email };
}

// generateLink returns a one-time hashed token without sending any email.
async function signIn(browser: Browser, email: string, next: string): Promise<Page> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const page = await (await browser.newContext()).newPage();
  const q = new URLSearchParams({ token_hash: data.properties.hashed_token, type: "magiclink", next });
  await page.goto("/auth/callback?" + q);
  return page;
}

// Picks "my choice" and "my guess" in one round of the guess game and submits.
async function answer(page: Page, round: number, own: number, guess: number) {
  const card = page.locator(`.guess-round[data-round="${round}"]`);
  await card.locator("fieldset").nth(0).locator("label.choice").nth(own).click();
  await card.locator("fieldset").nth(1).locator("label.choice").nth(guess).click();
  await card.getByRole("button", { name: "답 제출" }).click();
}

// A stand-in for the YouTube IFrame Player so the test does not depend on youtube.com being reachable.
// It keeps its own clock, reports the same state numbers (1 playing, 2 paused, 3 buffering, 5 cued),
// and lets the test act like a person pressing YouTube's own controls (userPause, userSeek) or hit an embed error.
function fakeYouTube() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  const box = (w.__yt = { players: [] as any[], userPause() { box.players[0]._set(2); }, userSeek(s: number) { box.players[0].seekTo(s); }, fail(code: number) { box.players[0].ev.onError?.({ data: code }); } });
  class Player {
    ev: any; id: string; t = 0; at = performance.now(); state = 5;
    constructor(el: HTMLElement, o: any) {
      this.ev = o.events || {};
      this.id = o.videoId;
      const shell = document.createElement("div");
      shell.className = "fake-yt";
      el.replaceWith(shell);
      box.players.push(this);
      setTimeout(() => this.ev.onReady?.({ target: this }), 20);
    }
    _now() { return this.state === 1 ? this.t + (performance.now() - this.at) / 1000 : this.t; }
    _set(state: number) {
      this.t = this._now();
      this.at = performance.now();
      this.state = state;
      setTimeout(() => this.ev.onStateChange?.({ data: state }), 0);
    }
    getCurrentTime() { return this._now(); }
    getPlayerState() { return this.state; }
    seekTo(s: number) { this.t = s; this.at = performance.now(); }
    playVideo() { if (this.state !== 1) this._set(1); }
    pauseVideo() { if (this.state === 1) this._set(2); }
    cueVideoById(o: { videoId: string; startSeconds?: number }) { this.id = o.videoId; this.t = o.startSeconds ?? 0; this.at = performance.now(); this.state = 5; }
  }
  w.YT = { Player };
}
const playerTime = (page: Page) => page.evaluate(() => (window as any).__yt.players[0].getCurrentTime() as number);
const playerState = (page: Page) => page.evaluate(() => (window as any).__yt.players[0].state as number);

test.afterAll(async () => {
  // Clean up anyone the test made, even if a step failed. Already-deleted users just error.
  for (const id of made) await admin.auth.admin.deleteUser(id).catch(() => {});
});

test("two people: create, invite, join, leave, delete", async ({ browser }) => {
  const a = await makeUser("a");
  const b = await makeUser("b");

  // 1. A signs in and creates a room.
  const pageA = await signIn(browser, a.email, "/room");
  pageA.on("pageerror", (e) => console.log("pageA pageerror:", e.message.slice(0, 300)));
  pageA.on("console", (m) => { if (m.type() === "error") console.log("pageA console error:", m.text().slice(0, 300)); });
  pageA.on("requestfailed", (r) => console.log("pageA request failed:", r.url().slice(0, 160)));
  await expect(pageA.getByRole("heading", { name: "우리 방 만들기" })).toBeVisible();
  // Staying signed in: the sign-in cookie is not a session cookie (it outlives closing the browser),
  // and the home page and the login page send a signed-in person straight to the room.
  const authCookies = (await pageA.context().cookies()).filter((c) => c.name.includes("auth-token"));
  expect(authCookies.length).toBeGreaterThan(0);
  for (const c of authCookies) expect(c.expires).toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 3600);
  await pageA.goto("/");
  await expect(pageA).toHaveURL(/\/room$/);
  await pageA.goto("/login?next=/room");
  await expect(pageA).toHaveURL(/\/room$/);
  await expect(pageA.getByRole("heading", { name: "우리 방 만들기" })).toBeVisible();
  await pageA.getByLabel("함께한 첫날").fill("2026-06-23");
  await pageA.getByRole("button", { name: "방 만들기" }).click();
  await expect(pageA.getByText("아직 상대가 들어오지 않았어요.")).toBeVisible();
  // The room shows the same upcoming days as the public home, from the saved first day.
  await expect(pageA.locator(".room-milestones .rail li").first()).toBeVisible();
  expect(await pageA.locator(".room-milestones .rail li").count()).toBeGreaterThanOrEqual(2);

  // 2. A makes an invite link.
  await pageA.getByRole("button", { name: "초대 링크 만들기" }).click();
  const link = await pageA.getByLabel("초대 링크").inputValue();
  const invitePath = new URL(link).pathname;
  expect(invitePath).toMatch(/^\/invite\/[0-9a-f]{64}$/);

  // A's page listens on the room's private channel.
  await expect(pageA.locator("html[data-room-live=on]")).toHaveCount(1);

  // 3. B opens the invite (sign-in first), then joins.
  const pageB = await signIn(browser, b.email, invitePath);
  await pageB.getByRole("button", { name: "방에 들어가기" }).click();
  await expect(pageB.getByText("두 사람이 모두 들어왔어요.")).toBeVisible();
  // A sees it without reloading: the realtime message refreshes the page.
  await expect(pageA.getByText("두 사람이 모두 들어왔어요.")).toBeVisible({ timeout: 10_000 });
  await expect(pageA.locator("html[data-room-live=on]")).toHaveCount(1);

  // 3b. Room home. A adds a plan; B sees it without reloading.
  await pageA.getByLabel("날짜", { exact: true }).fill("2027-01-01");
  await pageA.getByLabel("무엇을 할까요").fill("새해 일출 보기");
  await pageA.getByRole("button", { name: "약속 추가" }).click();
  await expect(pageA.locator(".plan-list").getByText("새해 일출 보기")).toBeVisible();
  await expect(pageB.locator(".plan-list").getByText("새해 일출 보기")).toBeVisible({ timeout: 10_000 });
  await expect(pageB.locator(".room-count").getByText("새해 일출 보기")).toBeVisible();
  // B switches the shared mood; A's page takes it live.
  await pageB.getByText("방 설정", { exact: true }).click();
  await pageB.locator('label.mood-option[data-mood="night"]').click();
  await pageB.getByRole("button", { name: "이 무드로 바꾸기" }).click();
  await expect(pageB.locator('.room[data-mood="night"]')).toHaveCount(1);
  await expect(pageA.locator('.room[data-mood="night"]')).toHaveCount(1, { timeout: 10_000 });

  // 3c. Chat. Both open it; each sees the other's message without reloading.
  await pageA.getByRole("link", { name: "대화", exact: true }).click();
  await pageB.getByRole("link", { name: "대화", exact: true }).click();
  await expect(pageA.locator("html[data-room-live=on]")).toHaveCount(1);
  await expect(pageB.locator("html[data-room-live=on]")).toHaveCount(1);
  await pageA.getByLabel("메시지").fill("안녕, 오늘 저녁 뭐 먹을까?");
  await pageA.getByRole("button", { name: "보내기" }).click();
  await expect(pageA.locator(".mine .bubble", { hasText: "오늘 저녁" })).toBeVisible();
  await expect(pageB.locator(".theirs .bubble", { hasText: "오늘 저녁" })).toBeVisible({ timeout: 10_000 });
  await pageB.getByLabel("메시지").fill("떡볶이!");
  await pageB.getByRole("button", { name: "보내기" }).click();
  await expect(pageA.locator(".theirs .bubble", { hasText: "떡볶이" })).toBeVisible({ timeout: 10_000 });
  // A reload shows the same conversation from the server.
  await pageA.reload();
  await expect(pageA.locator(".chat-list .bubble")).toHaveCount(2);
  // 3d. Guess game. A starts; B's page shows the rounds live.
  await pageA.getByRole("link", { name: "게임", exact: true }).click();
  await pageB.getByRole("link", { name: "게임", exact: true }).click();
  await expect(pageA.locator("html[data-room-live=on]")).toHaveCount(1);
  await expect(pageB.locator("html[data-room-live=on]")).toHaveCount(1);
  await pageA.getByRole("button", { name: "게임 시작" }).click();
  await expect(pageB.locator(".guess-round")).toHaveCount(3, { timeout: 10_000 });
  // A answers round 1. B is told only that A answered; nothing is revealed.
  await answer(pageA, 1, 0, 1);
  await expect(pageA.locator('.guess-round[data-round="1"] .waiting')).toBeVisible();
  await expect(pageB.locator('.guess-round[data-round="1"]').getByText("상대는 이미 답했어요.")).toBeVisible({ timeout: 10_000 });
  await expect(pageB.locator('.guess-round[data-round="1"] .round-result')).toHaveCount(0);
  // B answers later; both see both answers at once. A guessed B's choice (option 1).
  await answer(pageB, 1, 1, 0);
  await expect(pageA.locator('.guess-round[data-round="1"] .hit')).toBeVisible({ timeout: 10_000 });
  await expect(pageB.locator('.guess-round[data-round="1"] .hit')).toBeVisible();
  for (const r of [2, 3]) {
    await answer(pageA, r, 2, 2);
    await answer(pageB, r, 3, 3);
  }
  await expect(pageA.getByRole("heading", { name: "결과" })).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByRole("heading", { name: "결과" })).toBeVisible({ timeout: 10_000 });
  // A reload shows the same finished game from the server.
  await pageB.reload();
  await expect(pageB.getByRole("heading", { name: "결과" })).toBeVisible();

  // 3e. Drawing quiz. A draws, B guesses. B's browser must never receive the word before the end.
  const bTraffic: string[] = [];
  pageB.on("response", async (res) => {
    if (!res.url().includes("supabase.co")) return;
    try { bTraffic.push(await res.text()); } catch { /* redirects and aborted calls have no body */ }
  });
  await pageA.getByRole("link", { name: "100초 그림 퀴즈" }).click();
  await pageB.getByRole("link", { name: "100초 그림 퀴즈" }).click();
  await expect(pageA.locator("html[data-room-live=on]")).toHaveCount(1);
  await expect(pageB.locator("html[data-room-live=on]")).toHaveCount(1);
  await pageA.getByRole("button", { name: "게임 시작" }).click();
  await expect(pageA.getByText("나는 그리는 사람")).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByText("나는 맞히는 사람")).toBeVisible({ timeout: 10_000 });
  await pageA.getByRole("button", { name: "준비", exact: true }).click();
  await expect(pageB.getByText("상대는 준비했어요.")).toBeVisible({ timeout: 10_000 });
  await pageB.getByRole("button", { name: "준비", exact: true }).click();
  // The 100 seconds start for both. Only the drawer is shown the word.
  await expect(pageA.locator(".draw-word strong")).toBeVisible({ timeout: 10_000 });
  await expect(pageB.locator(".draw-timer strong")).toBeVisible({ timeout: 10_000 });
  const word = (await pageA.locator(".draw-word strong").innerText()).trim();
  expect(word.length).toBeGreaterThan(0);
  await expect(pageB.locator("body")).not.toContainText(word);
  const inkPixels = (page: Page) =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>(".draw-canvas")!;
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    });
  expect(await inkPixels(pageB)).toBe(0);
  // A draws one line; B sees it appear without reloading.
  // The board sits below the word and the clock; mouse events outside the window never reach the page.
  await pageA.locator(".draw-canvas").scrollIntoViewIfNeeded();
  const board = (await pageA.locator(".draw-canvas").boundingBox())!;
  const sent = pageA.waitForResponse((r) => r.url().includes("add_draw_stroke"), { timeout: 10_000 });
  await pageA.mouse.move(board.x + board.width * 0.2, board.y + board.height * 0.3);
  await pageA.mouse.down();
  await pageA.mouse.move(board.x + board.width * 0.7, board.y + board.height * 0.6, { steps: 12 });
  await pageA.mouse.up();
  // First the drawer's side: the server accepted the line (true = drawn).
  const sentRes = await sent;
  expect([sentRes.status(), await sentRes.text()]).toEqual([200, "true"]);
  expect(await inkPixels(pageA)).toBeGreaterThan(200);
  await expect.poll(() => inkPixels(pageB), { timeout: 10_000 }).toBeGreaterThan(200);
  // A reload keeps the drawing and the same running clock.
  await pageB.reload();
  await expect.poll(() => inkPixels(pageB), { timeout: 10_000 }).toBeGreaterThan(200);
  const secondsB = Number(await pageB.locator(".draw-timer strong").innerText());
  expect(secondsB).toBeGreaterThan(0);
  expect(secondsB).toBeLessThan(100);
  // The word is nowhere in anything B's browser has received so far.
  expect(bTraffic.join("\n")).not.toContain(word);
  // A wrong answer can be retried; both see the attempt.
  await pageB.getByLabel("정답", { exact: true }).fill("아님아님아님");
  await pageB.getByRole("button", { name: "제출" }).click();
  await expect(pageB.getByText("아니에요. 다시 도전해 보세요!")).toBeVisible({ timeout: 10_000 });
  await expect(pageA.locator(".draw-guesses li", { hasText: "아님아님아님" })).toBeVisible({ timeout: 10_000 });
  // The right answer scores 1 on both screens, and the next word starts on a clean board.
  await pageB.getByLabel("정답", { exact: true }).fill(word);
  await pageB.getByRole("button", { name: "제출" }).click();
  await expect(pageB.getByText("정답! 다음 문제예요.")).toBeVisible({ timeout: 10_000 });
  await expect(pageA.getByTestId("draw-score")).toHaveText("1", { timeout: 10_000 });
  await expect(pageB.getByTestId("draw-score")).toHaveText("1");
  await expect(pageA.locator(".draw-word strong")).not.toHaveText(word, { timeout: 10_000 });
  const word2 = (await pageA.locator(".draw-word strong").innerText()).trim();
  await expect.poll(() => inkPixels(pageB), { timeout: 10_000 }).toBe(0);
  await expect(pageB.locator(".draw-word-list li", { hasText: word })).toBeVisible();
  // Pass: a new word, the score stays.
  await pageA.getByRole("button", { name: "패스" }).click();
  await expect(pageA.locator(".draw-word strong")).not.toHaveText(word2, { timeout: 10_000 });
  await expect(pageB.locator(".draw-word-list li", { hasText: word2 })).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByTestId("draw-score")).toHaveText("1");
  const word3 = (await pageA.locator(".draw-word strong").innerText()).trim();
  await pageB.waitForTimeout(1500);
  expect(bTraffic.join("\n")).not.toContain(word3);
  // Time up (moved by the test instead of waiting 100 s): both see the count, the record is 1.
  const { data: open } = await admin.from("draw_games").select("id").is("result", null).eq("drawer", a.id);
  for (const row of open ?? [])
    await admin.from("draw_games").update({ started_at: new Date(Date.now() - 101_000).toISOString(), deadline_at: new Date(Date.now() - 1000).toISOString() }).eq("id", row.id);
  await pageA.reload();
  await expect(pageA.getByTestId("draw-final")).toHaveText("1개", { timeout: 10_000 });
  await expect(pageB.getByTestId("draw-final")).toHaveText("1개", { timeout: 15_000 });
  await expect(pageA.locator(".draw-records")).toContainText("1개");
  // One more round where A chooses that B draws.
  await pageA.getByText("상대가 그려요").click();
  await pageA.getByRole("button", { name: "한 판 더" }).click();
  await expect(pageA.getByText("나는 맞히는 사람")).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByText("나는 그리는 사람")).toBeVisible({ timeout: 10_000 });

  // Watch together: a link, both ready, play / pause / seek follow each other, a reload resumes, an embed error recovers.
  for (const page of [pageA, pageB]) {
    await page.route("https://www.youtube.com/**", (route) => route.abort());
    await page.addInitScript(fakeYouTube);
  }
  await pageA.getByRole("link", { name: "함께 보기", exact: true }).click();
  await pageB.getByRole("link", { name: "함께 보기", exact: true }).click();
  await expect(pageA.locator(".watch[data-watch=idle]")).toBeVisible({ timeout: 10_000 });
  await expect(pageB.locator(".watch[data-watch=idle]")).toBeVisible({ timeout: 10_000 });
  await pageA.getByLabel("유튜브 링크").fill("https://evil.example.com/watch?v=dQw4w9WgXcQ");
  await pageA.getByRole("button", { name: "영상 정하기" }).click();
  await expect(pageA.getByText("유튜브 링크가 아닌 것 같아요")).toBeVisible();
  await pageA.getByLabel("유튜브 링크").fill("https://youtu.be/dQw4w9WgXcQ?si=share");
  await pageA.getByRole("button", { name: "영상 정하기" }).click();
  await expect(pageA.locator(".watch[data-watch=paused]")).toBeVisible({ timeout: 10_000 });
  await expect(pageB.locator(".watch[data-watch=paused]")).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => playerState(pageB), { timeout: 10_000 }).toBe(5);
  // One ready is not enough; the second starts both.
  await pageA.getByRole("button", { name: "준비됐어요" }).click();
  await expect(pageB.getByText("상대도 준비했어요.")).toBeVisible({ timeout: 10_000 });
  await expect(pageB.locator(".watch[data-watch=paused]")).toBeVisible();
  await pageB.getByRole("button", { name: "준비됐어요" }).click();
  await expect(pageA.locator(".watch[data-watch=playing]")).toBeVisible({ timeout: 10_000 });
  await expect(pageB.locator(".watch[data-watch=playing]")).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => playerState(pageA), { timeout: 10_000 }).toBe(1);
  await expect.poll(() => playerState(pageB), { timeout: 10_000 }).toBe(1);
  await expect.poll(async () => Math.abs((await playerTime(pageA)) - (await playerTime(pageB))), { timeout: 10_000 }).toBeLessThan(2.5);
  // A pauses, B jumps 10 s while paused, A plays again.
  await pageA.getByRole("button", { name: "같이 멈춤" }).click();
  await expect(pageB.locator(".watch[data-watch=paused]")).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => playerState(pageB), { timeout: 10_000 }).toBe(2);
  const before = await playerTime(pageB);
  await pageB.getByRole("button", { name: "+10초" }).click();
  await expect.poll(async () => (await playerTime(pageA)) - before, { timeout: 10_000 }).toBeGreaterThan(8);
  await pageA.getByRole("button", { name: "같이 재생" }).click();
  await expect(pageB.locator(".watch[data-watch=playing]")).toBeVisible({ timeout: 10_000 });
  // Someone presses pause on the video itself (not our button): the partner follows.
  // (A moment after a partner's change the screen ignores its own player events, so wait that out first.)
  await pageB.waitForTimeout(1600);
  await pageB.evaluate(() => (window as any).__yt.userPause());
  await expect(pageA.locator(".watch[data-watch=paused]")).toBeVisible({ timeout: 10_000 });
  // …and drags its progress bar: the partner follows to the same spot.
  await pageA.waitForTimeout(1600);
  await pageA.evaluate(() => (window as any).__yt.userSeek(100));
  await expect.poll(async () => Math.abs((await playerTime(pageB)) - 100), { timeout: 10_000 }).toBeLessThan(1.5);
  // A reload comes back to the saved spot, paused; then playing, it comes back to the live spot.
  await pageB.reload();
  await expect(pageB.locator(".watch[data-watch=paused]")).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => Math.abs((await playerTime(pageB)) - 100), { timeout: 10_000 }).toBeLessThan(1.5);
  await pageA.getByRole("button", { name: "같이 재생" }).click();
  await expect(pageB.locator(".watch[data-watch=playing]")).toBeVisible({ timeout: 10_000 });
  await pageB.reload();
  await expect(pageB.locator(".watch[data-watch=playing]")).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => playerState(pageB), { timeout: 10_000 }).toBe(1);
  await expect.poll(async () => Math.abs((await playerTime(pageA)) - (await playerTime(pageB))), { timeout: 10_000 }).toBeLessThan(2.5);
  // An embed-restricted video: a clear message and a way forward (another link).
  await pageA.getByRole("button", { name: "준비 취소" }).click();
  await expect(pageA.getByRole("button", { name: "준비됐어요" })).toBeEnabled({ timeout: 10_000 });
  await pageA.evaluate(() => (window as any).__yt.fail(150));
  await expect(pageA.getByText("퍼가기가 막혀 있어서")).toBeVisible();
  await expect(pageA.getByRole("link", { name: "유튜브에서 열기" })).toBeVisible();
  await expect(pageA.getByRole("button", { name: "준비됐어요" })).toBeDisabled();
  await pageA.getByLabel("유튜브 링크").fill("https://www.youtube.com/watch?v=aaaaaaaaaaa");
  await pageA.getByRole("button", { name: "영상 정하기" }).click();
  await expect(pageA.getByText("퍼가기가 막혀 있어서")).toHaveCount(0, { timeout: 10_000 });
  await expect(pageA.locator(".watch[data-watch=paused]")).toBeVisible({ timeout: 10_000 });
  await expect(pageB.locator(".watch[data-watch=paused]")).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByRole("button", { name: "준비됐어요" })).toBeEnabled({ timeout: 10_000 });

  // Helper: conditions in Korean give only activities that fit, and the AI switch is honestly off.
  await pageA.getByRole("link", { name: "도우미", exact: true }).click();
  await expect(pageA.getByText("AI 연결은 꺼져 있어요")).toBeVisible({ timeout: 10_000 });
  await pageA.waitForTimeout(3000); // let the page finish starting before typing
  // The page may still be starting up; typing before that is lost, so type again until the button wakes up.
  await expect(async () => {
    await pageA.getByLabel("원하는 조건").fill("10분, 경쟁은 싫어");
    await expect(pageA.getByRole("button", { name: "추천받기" })).toBeEnabled({ timeout: 1000 });
  }).toPass({ timeout: 25_000 });
  await pageA.getByRole("button", { name: "추천받기" }).click();
  await expect(pageA.getByRole("heading", { name: "상대 선택 맞히기" })).toBeVisible();
  await expect(pageA.getByRole("heading", { name: "100초 그림 퀴즈" })).toHaveCount(0);
  await expect(pageA.getByRole("heading", { name: "함께 보기" })).toHaveCount(0);
  await pageA.getByRole("link", { name: "이 활동 열기" }).click();
  await expect(pageA).toHaveURL(/\/room\/game/);

  // Gomoku: A starts, they alternate taps (preview, then confirm); A gets five in a row; the score shows; the rematch swaps who goes first.
  await pageA.goto("/room/game?g=gomoku");
  await pageB.goto("/room/game?g=gomoku");
  await pageA.waitForTimeout(3000); // let the pages finish starting
  await expect(async () => {
    await pageA.getByRole("button", { name: "게임 시작" }).click({ timeout: 3000 });
    await expect(pageA.locator(".gomoku[data-status=open]")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 25_000 });
  await expect(pageB.locator(".gomoku[data-status=open][data-turn=partner]")).toBeVisible({ timeout: 10_000 });
  const stone = async (page: Page, x: number, y: number) => {
    await page.locator(`.cell[data-x="${x}"][data-y="${y}"]`).click();
    await page.getByRole("button", { name: "여기에 놓기" }).click();
  };
  for (let i = 0; i < 5; i++) {
    await expect(pageA.locator(".gomoku[data-turn=me]")).toBeVisible({ timeout: 10_000 });
    await stone(pageA, 3 + i, 5);
    await expect(pageB.locator(`.cell[data-x="${3 + i}"][data-y="5"][data-stone="black"]`)).toBeVisible({ timeout: 10_000 });
    if (i < 4) {
      await expect(pageB.locator(".gomoku[data-turn=me]")).toBeVisible({ timeout: 10_000 });
      await stone(pageB, i, 10);
      await expect(pageA.locator(`.cell[data-x="${i}"][data-y="10"][data-stone="white"]`)).toBeVisible({ timeout: 10_000 });
    }
  }
  await expect(pageA.getByText("이겼어요!")).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByText("졌어요.")).toBeVisible({ timeout: 10_000 });
  await expect(pageA.locator('.cell[data-win="true"]')).toHaveCount(5);
  await expect(pageA.getByText("나 1승 · 상대 0승 · 무승부 0")).toBeVisible();
  await expect(pageB.getByText("나 0승 · 상대 1승 · 무승부 0")).toBeVisible({ timeout: 10_000 });
  await pageB.reload();
  await expect(pageB.locator('.cell[data-win="true"]')).toHaveCount(5, { timeout: 10_000 });
  await pageB.waitForTimeout(3000);
  await expect(async () => {
    await pageB.getByRole("button", { name: "재대결 (선공 교대)" }).click({ timeout: 3000 });
    await expect(pageB.locator(".gomoku[data-status=open][data-turn=me]")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 25_000 });
  await expect(pageA.locator(".gomoku[data-status=open][data-turn=partner]")).toBeVisible({ timeout: 10_000 });

  // Mini golf: both drag at the same time; each screen shows both live counters going up and both balls stopping.
  await pageA.goto("/room/game?g=golf");
  await pageB.goto("/room/game?g=golf");
  await pageA.waitForTimeout(3000);
  await expect(async () => {
    await pageA.getByRole("button", { name: "3홀 시작" }).click({ timeout: 3000 });
    await expect(pageA.locator(".golf[data-status=open]")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 25_000 });
  await expect(pageB.locator(".golf[data-status=open]")).toBeVisible({ timeout: 10_000 });
  await expect(pageA.getByRole("button", { name: "치기" })).toHaveCount(0);
  await expect(pageA.getByTestId("golf-count-me")).toHaveText("0");
  // Drag anywhere on the course: press, pull back to the left, let go -> the ball flies right.
  const drag = async (page: Page) => {
    const canvas = page.getByTestId("golf-canvas");
    await expect(canvas).toHaveAttribute("data-can-shoot", "true", { timeout: 10_000 });
    await canvas.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 120));
    const box = (await canvas.boundingBox())!;
    expect(box.y + box.height).toBeLessThan(page.viewportSize()!.height + 1);
    const y = box.y + box.height * 0.5;
    await page.mouse.move(box.x + box.width * 0.5, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, y, { steps: 4 });
    await page.mouse.move(box.x + box.width * 0.4, y, { steps: 4 });
    await page.mouse.up();
  };
  await Promise.all([drag(pageA), drag(pageB)]);
  await expect(pageA.getByTestId("golf-count-me")).toHaveText("1", { timeout: 10_000 });
  await expect(pageA.getByTestId("golf-count-partner")).toHaveText("1", { timeout: 10_000 });
  await expect(pageB.getByTestId("golf-count-me")).toHaveText("1", { timeout: 10_000 });
  await expect(pageB.getByTestId("golf-count-partner")).toHaveText("1", { timeout: 10_000 });
  // Both balls come to rest on both screens; A hits again and B's screen counts it live.
  await expect(pageA.getByTestId("golf-canvas")).toHaveAttribute("data-me-moving", "false", { timeout: 15_000 });
  await expect(pageA.getByTestId("golf-canvas")).toHaveAttribute("data-partner-moving", "false", { timeout: 15_000 });
  await expect(pageB.getByTestId("golf-canvas")).toHaveAttribute("data-me-moving", "false", { timeout: 15_000 });
  await drag(pageA);
  await expect(pageB.getByTestId("golf-count-partner")).toHaveText("2", { timeout: 10_000 });
  await pageB.reload();
  await expect(pageB.getByTestId("golf-count-me")).toHaveText("1", { timeout: 10_000 });
  await expect(pageB.getByTestId("golf-count-partner")).toHaveText("2");
  // Giving up ends the game for both; no record is written.
  await pageA.getByRole("button", { name: "이 판 그만두기" }).click();
  await pageA.getByRole("button", { name: "그만둘게요" }).click();
  await expect(pageA.locator(".golf[data-status=cancelled]")).toBeVisible({ timeout: 10_000 });
  await expect(pageB.locator(".golf[data-status=cancelled]")).toBeVisible({ timeout: 10_000 });
  await expect(pageA.getByText("아직 기록이 없어요")).toBeVisible();

  await pageA.getByRole("link", { name: "홈", exact: true }).click();
  await pageB.getByRole("link", { name: "홈", exact: true }).click();
  await expect(pageA.locator("html[data-room-live=on]")).toHaveCount(1);

  // 4. The same link cannot be used again by a third person.
  const c = await makeUser("c");
  const pageC = await signIn(browser, c.email, invitePath);
  await pageC.getByRole("button", { name: "방에 들어가기" }).click();
  // Find the message by its text: Next.js also keeps an empty role="alert" route announcer on every page.
  await expect(pageC.getByText("만료되었거나 이미 사용된 초대예요", { exact: false })).toBeVisible();

  // 5. B leaves. A is told.
  await pageB.getByText("방 나가기", { exact: true }).first().click();
  await pageB.getByLabel("네, 방을 닫고 나갈게요").check();
  await pageB.getByRole("button", { name: "방 나가기" }).click();
  await expect(pageB.getByText("방에서 나왔어요.")).toBeVisible();
  // Again no reload: A is moved to the "partner left" view live.
  await expect(pageA.getByText("상대가 방을 나갔어요. 새 방을 만들 수 있어요.")).toBeVisible({ timeout: 10_000 });

  // 6. A deletes the account. Supabase no longer has the user.
  await pageA.getByText("계정 삭제", { exact: true }).first().click();
  await pageA.getByLabel("네, 내 계정을 지울게요").check();
  await pageA.getByRole("button", { name: "계정 삭제" }).click();
  await expect(pageA.getByText("계정과 데이터를 모두 지웠어요.")).toBeVisible();
  const gone = await admin.auth.admin.getUserById(a.id);
  expect(gone.data.user).toBeNull();
});
