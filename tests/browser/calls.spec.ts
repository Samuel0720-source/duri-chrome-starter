// Exercise the production WebRTC session with synthetic camera/mic devices. Only the room
// signal transport is replaced here. Its membership and payload contract has a separate DB test.
import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
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
    outputLevel: () => number;
    relay: (message: Signal) => Promise<void>;
  }
}

// A continuous non-silent input makes this check independent of the fake device's periodic beeps.
function microphoneTone() {
  const rate = 48000;
  const data = Buffer.alloc(44 + rate * 2);
  data.write("RIFF"); data.writeUInt32LE(data.length - 8, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write("data", 36);
  data.writeUInt32LE(rate * 2, 40);
  for (let i = 0; i < rate; i++) data.writeInt16LE(Math.round(10000 * Math.sin(2 * Math.PI * 465 * i / rate)), 44 + 2 * i);
  return data;
}

test("both partners play audible voice and video calls, recover blocked playback and release their devices", async ({ playwright, baseURL }, testInfo) => {
  test.setTimeout(65000);
  const wav = testInfo.outputPath("mic.wav");
  await writeFile(wav, microphoneTone());
  const browser = await playwright.chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required", "--use-file-for-fake-audio-capture=" + wav],
  });
  try {
    const peers: Page[] = [];
    const ids = [randomUUID(), randomUUID()];
    const sources = {
      "/test-audio": "src/app/room/chat/call-audio.ts",
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
        const audioPath = "/test-audio";
        const { attachCallAudio } = await import(audioPath);
        const audio = document.body.appendChild(document.createElement("audio"));
        const retry = document.body.appendChild(document.createElement("button"));
        retry.textContent = "Play call audio";
        retry.hidden = true;
        let allowPlayback = false;
        const play = audio.play.bind(audio);
        audio.play = () => allowPlayback ? play() : Promise.reject(new DOMException("User gesture needed", "NotAllowedError"));
        let player: ReturnType<typeof import("../../src/app/room/chat/call-audio").attachCallAudio> | undefined;
        retry.onclick = () => { allowPlayback = true; player?.play(); };
        const ctx = new AudioContext();
        await ctx.resume();
        const analyser = ctx.createAnalyser();
        const samples = new Float32Array(analyser.fftSize);
        let source: MediaStreamAudioSourceNode | undefined;
        let attached: MediaStreamTrack | undefined;
        window.outputLevel = () => {
          if (audio.paused || audio.muted || audio.volume === 0 || audio.currentTime === 0) return 0;
          if (!source) {
            // Sample what the playing Chromium element emits, after decoding and autoplay approval.
            const output = (audio as HTMLAudioElement & { captureStream(): MediaStream }).captureStream();
            if (!output.getAudioTracks().length) return 0;
            source = ctx.createMediaStreamSource(output);
            source.connect(analyser);
          }
          analyser.getFloatTimeDomainData(samples);
          return samples.reduce((peak, n) => Math.max(peak, Math.abs(n)), 0);
        };
        window.captured = [];
        window.callView = { phase: "idle", mode: "audio", note: "hint" };
        window.callTest = new CallSession(id,
          (session: string, kind: Signal["kind"], detail: string) => window.relay({ id: session, sender: id, kind, detail }),
          (view: View) => {
            window.callView = view;
            if (view.local) window.captured = view.local.getTracks();
            const track = view.remote?.getAudioTracks()[0];
            if (track === attached) return;
            player?.detach();
            source?.disconnect();
            source = undefined;
            attached = track;
            if (!track) { allowPlayback = false; retry.hidden = true; return; }
            player = attachCallAudio(audio, track, (blocked: boolean) => { retry.hidden = !blocked; });
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
        const retry = peer.getByRole("button", { name: "Play call audio" });
        await expect(retry).toBeVisible();
        await retry.click();
        await expect(retry).toBeHidden();
        await expect.poll(() => peer.evaluate(() => window.outputLevel()), { timeout: 10000 }).toBeGreaterThan(0.001);
      }
      await a.evaluate(() => window.callTest.end());
      for (const peer of peers) {
        await expect.poll(() => phase(peer)).toBe("idle");
        expect(await peer.evaluate(() => window.captured.every(tr => tr.readyState === "ended"))).toBe(true);
      }
    }
  } finally { await browser.close(); }
});
