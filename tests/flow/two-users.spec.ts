import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

// Load .env.local into this test process (Next.js only loads it for the app).
try { process.loadEnvFile(".env.local"); } catch {}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;

test.skip(!url || !secret, "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local");

// The admin client makes throwaway users, so no Google and no real mailbox are needed.
const admin: SupabaseClient = createClient(url ?? "http://x", secret ?? "x", {
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

test.afterAll(async () => {
  // Clean up anyone the test made, even if a step failed. Already-deleted users just error.
  for (const id of made) await admin.auth.admin.deleteUser(id).catch(() => {});
});

test("two people: create, invite, join, leave, delete", async ({ browser }) => {
  const a = await makeUser("a");
  const b = await makeUser("b");

  // 1. A signs in and creates a room.
  const pageA = await signIn(browser, a.email, "/room");
  await expect(pageA.getByRole("heading", { name: "우리 방 만들기" })).toBeVisible();
  await pageA.getByLabel("함께한 첫날").fill("2026-06-23");
  await pageA.getByRole("button", { name: "방 만들기" }).click();
  await expect(pageA.getByText("아직 상대가 들어오지 않았어요.")).toBeVisible();

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
