import { defineConfig } from "@playwright/test";

// Recorded two-person demo against the live site (tests/demo). Run on demand only.
export default defineConfig({
  testDir: "tests/demo",
  workers: 1,
  timeout: 600_000,
  reporter: "list",
  use: { actionTimeout: 20_000, navigationTimeout: 30_000, baseURL: process.env.FLOW_URL ?? "http://localhost:3000", headless: true, locale: "ko-KR", launchOptions: { slowMo: 120 } },
});
