import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 25_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3189",
    headless: true,
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3189",
    url: "http://127.0.0.1:3189",
    reuseExistingServer: false,
    timeout: 45_000,
  },
});
