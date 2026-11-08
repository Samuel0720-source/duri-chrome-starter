import { expect, test } from "@playwright/test";

test("small and large windows have independent preview state and usable controls", async ({
  browser,
  baseURL,
}) => {
  const large = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const small = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const [a, b] = await Promise.all([large.newPage(), small.newPage()]);
    await Promise.all([
      a.goto(baseURL!),
      b.goto(baseURL!),
    ]);
    await a.getByLabel("함께한 첫날").fill("2099-01-02");
    await expect(a.getByText("첫날까지")).toBeVisible();
    await expect(b.getByLabel("함께한 첫날")).toHaveValue("2026-08-13");
    await b.getByLabel("기준 시간대").selectOption("Asia/Seoul");
    await expect(a.getByLabel("기준 시간대")).toHaveValue("America/Vancouver");
    for (const width of [320, 390, 768, 1440]) {
      await a.setViewportSize({ width, height: 850 });
      await expect(a.getByLabel("함께한 첫날")).toBeVisible();
      expect(
        await a.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  } finally {
    await Promise.all([large.close(), small.close()]);
  }
});

test("Chrome receives a valid install manifest and an offline fallback without private page caching", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const manifestURL = await page
    .locator("link[rel=manifest]")
    .getAttribute("href");
  expect(manifestURL).toBeTruthy();
  const response = await page.request.get(manifestURL!);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    id: "/",
    start_url: "/",
    display: "standalone",
    scope: "/",
  });
  for (const icon of manifest.icons) {
    const img = await page.request.get(icon.src);
    const bytes = await img.body();
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    const side = Number(icon.sizes.split("x")[0]);
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
      side,
      side,
    ]);
  }
  const cdp = await context.newCDPSession(page);
  const data = await cdp.send("Page.getAppManifest");
  expect(data.errors.filter((error) => error.critical)).toEqual([]);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "지금은 오프라인이에요" }),
    ).toBeVisible();
    const paths = await page.evaluate(async () => {
      const cache = await caches.open("duri-public-fallback-v1");
      return (await cache.keys()).map((r) => new URL(r.url).pathname);
    });
    expect(paths).toEqual(["/offline.html"]);
  } finally {
    await context.setOffline(false);
  }
});
