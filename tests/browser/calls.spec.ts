// Exercise the production WebRTC session with synthetic camera/mic devices. Only the room
// signal transport is replaced here. Its membership and payload contract has a separate DB test.
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import ts from "typescript";
import type { CallSession, View } from "../../src/app/room/chat/call-session";
import type { Signal } from "../../src/core/room-call";

declare global {
  interface Window {
    callTest: CallSession;
    callView: View;
    captured: MediaStreamTrack[];
    relay: (message: Signal) => Promise<void>;
  }
}

test("two browsers decline, accept voice and video, and release both sets of tracks", async ({ playwright, baseURL }) => {
  test.setTimeout(65000);
  const browser = await playwright.chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  try {
    const peers: Page[] = [];
    const ids = [randomUUID(), randomUUID()];
    const sources = {
      "/test-session": "src/app/room/chat/call-session.ts",
      "/core/room-call": "src/core/room-call.ts",
      "/core/album.ts": "src/core/album.ts",
    };
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({ permissions: ["camera", "microphone"] });
      const page = await context.newPage();
      peers.push(page);
      await page.route("**/*", async route => {
        const path = new URL(route.request().url()).pathname;
        const file = sources[path as keyof typeof sources];
        if (!file) return route.fulfill({ contentType: "text/html", body: "<title>Call fixture</title>" });
        const src = await readFile(resolve(file), "utf8");
        const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
        return route.fulfill({ contentType: "text/javascript", body: js });
      });
      await page.exposeFunction("relay", (m: Signal) => {
        // The broadcast server acknowledges sending independently of the other device's processing.
        return peers[1 - i].evaluate(msg => { void window.callTest.receive(msg); }, m);
      });
      await page.goto(baseURL!);
      await page.evaluate(async id => {
        const path = "/test-session";
        const { CallSession } = await import(path);
        window.captured = [];
        window.callView = { phase: "idle", mode: "audio", note: "hint" };
        window.callTest = new CallSession(id,
          (session: string, kind: Signal["kind"], detail: string) => window.relay({ id: session, sender: id, kind, detail }),
          (view: View) => {
            window.callView = view;
            if (view.local) window.captured = view.local.getTracks();
          });
      }, ids[i]);
    }
    const [a, b] = peers;
    const phase = (p: Page) => p.evaluate(() => window.callView.phase);
    await a.evaluate(() => window.callTest.start("video"));
    await expect.poll(() => phase(b)).toBe("incoming");
    expect(await b.evaluate(() => window.captured.length)).toBe(0);
    await b.evaluate(() => window.callTest.end());
    await expect.poll(() => phase(a)).toBe("idle");
    for (const mode of ["audio", "video"] as const) {
      await a.evaluate(m => window.callTest.start(m), mode);
      await expect.poll(() => phase(b)).toBe("incoming");
      await b.evaluate(() => window.callTest.accept());
      for (const peer of peers) {
        await expect.poll(() => phase(peer), { timeout: 18000 }).toBe("connected");
        const kinds = await peer.evaluate(() => window.callView.remote?.getTracks().map(t => t.kind).sort());
        expect(kinds).toEqual(mode === "audio" ? ["audio"] : ["audio", "video"]);
      }
      await a.evaluate(() => window.callTest.end());
      for (const peer of peers) {
        await expect.poll(() => phase(peer)).toBe("idle");
        expect(await peer.evaluate(() => window.captured.every(tr => tr.readyState === "ended"))).toBe(true);
      }
    }
  } finally { await browser.close(); }
});
