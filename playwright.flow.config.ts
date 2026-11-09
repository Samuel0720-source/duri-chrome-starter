import { defineConfig } from "@playwright/test";

// Full two-person flow against a real Supabase project.
// Needs `npm run dev` running and SUPABASE_SECRET_KEY in .env.local.
export default defineConfig({
  testDir: "tests/flow",
  workers: 1,
  timeout: 90_000,
  reporter: "list",
  use: { baseURL: process.env.FLOW_URL ?? "http://localhost:3000", headless: true },
});
