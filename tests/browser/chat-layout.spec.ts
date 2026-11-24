import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { webpack } = require('next/dist/compiled/webpack/webpack');
let bundle: Buffer;
let css: string;
test.beforeAll(async ({}, info) => {
  const output = info.outputPath('chat-fixture');
  await new Promise<void>((done, reject) => webpack({
    mode: 'development', devtool: false, entry: resolve('tests/fixtures/chat-ui.tsx'),
    output: { path: output, filename: 'fixture.js' },
    resolve: { extensions: ['.tsx','.ts','.js'], alias: {
      'next/navigation': resolve('tests/fixtures/chat-services.ts'),
      [resolve('src/lib/supabase/browser')]: resolve('tests/fixtures/chat-services.ts'),
    } },
    module: { rules: [{ test: /\.tsx?$/, use: resolve('tests/fixtures/ui-loader.cjs') }] },
  }, (error: Error, stats: { hasErrors(): boolean; toString(): string }) => {
    if (error || stats.hasErrors()) reject(error || new Error(stats.toString())); else done();
  }));
  bundle = await readFile(output + '/fixture.js');
  css = (await Promise.all(['tokens','globals','garden','compact'].map(name => readFile(`src/app/${name}.css`, 'utf8')))).join('\n').replace(/@import[^;]+;/g, '');
});
for (const config of [
  { width:440, height:554, surface:'popup', lang:'en' },
  { width:440, height:554, surface:'popup', lang:'ko' },
  { width:460, height:600, surface:'window', lang:'en' },
  { width:320, height:500, surface:'popup', lang:'en' },
]) test(`chat input stays usable and history scrolls: ${JSON.stringify(config)}`, async ({ page, baseURL }) => {
  await page.setViewportSize(config);
  await page.route('**/__chat_fixture*', route => route.fulfill({ contentType:'text/html', body:`<html><head><style>${css}</style></head><body><div id="root"></div><script src="/__chat_bundle.js"></script></body></html>` }));
  await page.route('**/__chat_bundle.js', route => route.fulfill({ contentType:'text/javascript', body:bundle }));
  await page.goto(baseURL + '/__chat_fixture?' + new URLSearchParams({surface:config.surface,lang:config.lang,prompt:'What made you smile today?'}));
  const input = page.locator('#chat-input');
  const usable = () => input.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight && document.elementFromPoint(r.x+r.width/2, r.y+r.height/2) === el;
  });
  await expect.poll(usable).toBe(true);
  await input.click();
  await page.keyboard.type('Hello from the small window');
  await input.press('Enter');
  await expect(page.locator('.bubble').last()).toHaveText('What made you smile today?\nHello from the small window');
  await expect(page.locator('[data-state="sending"]')).toHaveCount(0);
  await expect.poll(usable).toBe(true);
  // Keyboard composition must not prematurely submit Korean text.
  await input.fill('사랑해');
  await input.dispatchEvent('keydown', {key:'Enter',code:'Enter',isComposing:true,bubbles:true,cancelable:true});
  await expect(input).toHaveValue('사랑해');
  await input.press('Enter');
  await expect(page.locator('.bubble').last()).toHaveText('사랑해');
  // Scrolling old messages must not move the composer or jump on a partner reply.
  const list = page.locator('.chat-list');
  await list.evaluate(el => el.scrollTo({top:0,behavior:'instant'}));
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBe(0);
  await page.evaluate(() => (window as any).receiveMessage());
  await expect(page.getByText('A new reply', {exact:true})).toHaveCount(1);
  expect(await list.evaluate(el => el.scrollTop)).toBe(0);
  expect(await usable()).toBe(true);
  // Scroll down by wheel, including when the cursor is over the message list.
  await list.hover();
  await page.mouse.wheel(0,10000);
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).failChat(true));
  await input.fill('Retry me'); await input.press('Enter');
  await expect(page.locator('[role="alert"]')).toBeVisible();
  expect(await usable()).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('chat.png')});
});
