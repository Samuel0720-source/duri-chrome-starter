import { expect, test } from "@playwright/test";

test("the PWA installs and launches the full website in standalone mode", async ({
  playwright, baseURL,
}, testInfo) => {
  const context = await playwright.chromium.launchPersistentContext(testInfo.outputPath("pwa-profile"), {
    channel: "chromium",
    headless: true,
    viewport: null,
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const control = await context.browser()!.newBrowserCDPSession();
  const manifestId = new URL("/", baseURL).href;
  let installed = false;
  try {
    const tab = await context.newPage();
    await tab.goto(manifestId);
    await tab.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    const tabControl = await context.newCDPSession(tab);
    const checks = await tabControl.send("Page.getInstallabilityErrors");
    expect(checks.installabilityErrors).toEqual([]);
    await control.send("PWA.install", { manifestId, installUrlOrBundleUrl: manifestId });
    installed = true;
    await control.send("PWA.changeAppUserSettings", { manifestId, displayMode: "standalone" });
    const launchUrl = manifestId + "#standalone-check";
    const launched = await control.send("PWA.launch", { manifestId, url: launchUrl });
    await expect.poll(() => context.pages().some((page) => page.url() === launchUrl)).toBe(true);
    const app = context.pages().find((page) => page.url() === launchUrl)!;
    const originalId = (await tabControl.send("Target.getTargetInfo")).targetInfo.targetId;
    const originalWindow = await control.send("Browser.getWindowForTarget", { targetId: originalId });
    const appWindow = await control.send("Browser.getWindowForTarget", { targetId: launched.targetId });
    expect(appWindow.windowId).not.toBe(originalWindow.windowId);
    await expect(app.getByRole("heading", { name: "우리 기념일" })).toBeVisible();
    await expect.poll(() => app.evaluate(() => matchMedia("(display-mode: standalone)").matches)).toBe(true);
    await expect(app.getByLabel("함께한 첫날")).toBeVisible();
  } finally {
    try {
      if (installed) await control.send("PWA.uninstall", { manifestId });
    } finally {
      await context.close();
    }
  }
});
