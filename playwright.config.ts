import { defineConfig } from "@playwright/test";

// PREVIEW_URL points the browser checks at a deployed HTTPS site instead of a local server.
const preview = process.env.PREVIEW_URL;
if (preview && new URL(preview).protocol !== "https:") throw new Error("PREVIEW_URL must be https");

export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: preview ? 60_000 : 25_000,
  reporter: "list",
  use: {
    baseURL: preview ? new URL(preview).origin : "http://127.0.0.1:3189",
    headless: true,
    locale: "ko-KR",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  webServer: preview
    ? undefined
    : {
        command: "npm run start -- --hostname 127.0.0.1 --port 3189",
        url: "http://127.0.0.1:3189",
        reuseExistingServer: false,
        timeout: 45_000,
      },
});
