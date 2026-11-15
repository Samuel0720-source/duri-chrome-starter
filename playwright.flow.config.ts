import { defineConfig } from "@playwright/test";

// Full two-person flow against a real Supabase project.
// Needs `npm run dev` running and SUPABASE_SECRET_KEY in .env.local.
export default defineConfig({
  testDir: "tests/flow",
  workers: 1,
  timeout: 300_000,
  reporter: "list",
  use: {
    actionTimeout: 20_000, navigationTimeout: 30_000, baseURL: process.env.FLOW_URL ?? "http://localhost:3000", headless: true, locale: "ko-KR",
    // Synthetic microphone and camera, so the flow can place a real call between the two people.
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] },
  },
});
