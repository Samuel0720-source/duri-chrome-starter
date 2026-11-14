"use client";

import type { MessageKey } from "../../../i18n/dict";
import { playerErrorKey, type VideoSource } from "../../../core/watch";

// One small shape for three very different players (YouTube iframe, Vimeo iframe, a plain <video>), so the
// sync logic in watch-together.tsx does not care which one it drives. States use YouTube's numbers:
// -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued.
export type Player = {
  kind: VideoSource;
  getCurrentTime(): number;
  getPlayerState(): number;
  seekTo(seconds: number): void;
  playVideo(): void;
  pauseVideo(): void;
  load(ref: string, startSeconds: number): void;
  destroy(): void;
};
export type PlayerEvents = {
  onReady(): void;
  onState(code: number): void;
  onError(key: MessageKey): void;
  onAutoplayBlocked(): void;
};

function loadScript(src: string, ready: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ready()) return resolve();
    let tag = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (!tag) {
      tag = document.createElement("script");
      tag.src = src;
      tag.async = true;
      document.head.appendChild(tag);
    }
    tag.addEventListener("load", () => resolve());
    tag.addEventListener("error", () => reject(new Error(src)));
  });
}

// ---------------------------------------------------------------- YouTube (official IFrame Player API)
type YTPlayer = {
  getCurrentTime(): number;
  getPlayerState(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  destroy?(): void;
};
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, options: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
    Vimeo?: { Player: new (el: HTMLElement, options: unknown) => VimeoPlayer };
  }
}

function loadYouTubeApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve();
    const earlier = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      earlier?.();
      resolve();
    };
    if (!document.querySelector("script[data-youtube-api]")) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.dataset.youtubeApi = "1";
      script.onerror = () => reject(new Error("youtube api"));
      document.head.appendChild(script);
    }
  });
}

async function youtube(host: HTMLElement, ref: string, ev: PlayerEvents): Promise<Player> {
  await loadYouTubeApi();
  const slot = document.createElement("div");
  host.replaceChildren(slot);
  const p = new window.YT!.Player(slot, {
    videoId: ref,
    playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
    events: {
      onReady: () => ev.onReady(),
      onStateChange: (e: { data: number }) => ev.onState(e.data),
      onError: (e: { data: number }) => ev.onError(playerErrorKey(e.data)),
      onAutoplayBlocked: () => ev.onAutoplayBlocked(),
    },
  });
  return {
    kind: "youtube",
    getCurrentTime: () => p.getCurrentTime(),
    getPlayerState: () => p.getPlayerState(),
    seekTo: (s) => p.seekTo(s, true),
    playVideo: () => p.playVideo(),
    pauseVideo: () => p.pauseVideo(),
    load: (id, start) => p.cueVideoById({ videoId: id, startSeconds: start }),
    destroy: () => {
      p.destroy?.();
      host.replaceChildren();
    },
  };
}

// ---------------------------------------------------------------- Vimeo (official Player SDK, promise based)
type VimeoPlayer = {
  ready(): Promise<void>;
  on(event: string, cb: (data: { seconds?: number; name?: string }) => void): void;
  play(): Promise<void>;
  pause(): Promise<void>;
  setCurrentTime(s: number): Promise<number>;
  getCurrentTime(): Promise<number>;
  loadVideo(options: unknown): Promise<unknown>;
  destroy(): Promise<void>;
};
const vimeoUrl = (ref: string) => {
  const [id, hash] = ref.split(":");
  return "https://player.vimeo.com/video/" + id + (hash ? "?h=" + hash : "");
};

async function vimeo(host: HTMLElement, ref: string, ev: PlayerEvents): Promise<Player> {
  await loadScript("https://player.vimeo.com/api/player.js", () => Boolean(window.Vimeo?.Player));
  const slot = document.createElement("div");
  slot.className = "watch-vimeo";
  host.replaceChildren(slot);
  const p = new window.Vimeo!.Player(slot, { url: vimeoUrl(ref), playsinline: true, autoplay: false, controls: true, responsive: true });
  // The SDK answers with promises; keep the last known time and state so reads stay instant.
  let t = 0;
  let at = performance.now();
  let state = -1;
  const set = (code: number) => {
    state = code;
    ev.onState(code);
  };
  const now = () => (state === 1 ? t + (performance.now() - at) / 1000 : t);
  p.on("timeupdate", (d) => { t = d.seconds ?? t; at = performance.now(); });
  p.on("seeked", (d) => { t = d.seconds ?? t; at = performance.now(); });
  p.on("play", () => { at = performance.now(); set(1); });
  p.on("pause", () => { t = now(); set(2); });
  p.on("ended", () => { t = now(); set(0); });
  p.on("bufferstart", () => set(3));
  p.on("bufferend", () => set(1));
  p.on("error", (d) => ev.onError(d.name === "PrivacyError" ? "watch.err.embed" : d.name === "NotFoundError" ? "watch.err.gone" : "watch.err.load"));
  p.ready().then(() => { state = 5; ev.onReady(); }, () => ev.onError("watch.err.load"));
  return {
    kind: "vimeo",
    getCurrentTime: now,
    getPlayerState: () => state,
    seekTo: (s) => { t = s; at = performance.now(); void p.setCurrentTime(s).catch(() => undefined); },
    playVideo: () => { void p.play().catch((e: { name?: string }) => (e?.name === "NotAllowedError" ? ev.onAutoplayBlocked() : undefined)); },
    pauseVideo: () => { void p.pause().catch(() => undefined); },
    load: (r, start) => {
      t = start; at = performance.now(); state = 5;
      void p.loadVideo({ url: vimeoUrl(r) }).then(() => p.setCurrentTime(start)).catch(() => ev.onError("watch.err.load"));
    },
    destroy: () => {
      void p.destroy().catch(() => undefined);
      host.replaceChildren();
    },
  };
}

// ---------------------------------------------------------------- a video file (<video>)
function file(host: HTMLElement, ref: string, ev: PlayerEvents): Player {
  const v = document.createElement("video");
  v.className = "watch-video";
  v.controls = true;
  v.playsInline = true;
  v.preload = "auto";
  host.replaceChildren(v);
  let pendingStart: number | null = 0;
  let buffering = false;
  let readySent = false;
  const begin = (url: string, start: number) => {
    pendingStart = start;
    readySent = false;
    v.src = url;
    v.load();
  };
  v.addEventListener("loadedmetadata", () => {
    if (pendingStart !== null) v.currentTime = pendingStart;
    pendingStart = null;
    if (!readySent) {
      readySent = true;
      ev.onReady();
    }
  });
  v.addEventListener("playing", () => { buffering = false; ev.onState(1); });
  v.addEventListener("pause", () => { if (!v.ended) ev.onState(2); });
  v.addEventListener("ended", () => ev.onState(0));
  v.addEventListener("waiting", () => { buffering = true; ev.onState(3); });
  v.addEventListener("error", () => ev.onError("watch.err.file"));
  begin(ref, 0);
  return {
    kind: "file",
    getCurrentTime: () => (pendingStart !== null ? pendingStart : v.currentTime),
    getPlayerState: () => (v.ended ? 0 : v.paused ? (v.readyState === 0 ? 5 : 2) : buffering ? 3 : 1),
    seekTo: (s) => {
      if (v.readyState === 0) pendingStart = s;
      else v.currentTime = s;
    },
    playVideo: () => {
      void v.play().catch((e: { name?: string }) => (e?.name === "NotAllowedError" ? ev.onAutoplayBlocked() : undefined));
    },
    pauseVideo: () => v.pause(),
    load: (url, start) => begin(url, start),
    destroy: () => {
      v.pause();
      v.removeAttribute("src");
      v.load();
      host.replaceChildren();
    },
  };
}

export async function createPlayer(source: VideoSource, host: HTMLElement, ref: string, ev: PlayerEvents): Promise<Player> {
  if (source === "vimeo") return vimeo(host, ref, ev);
  if (source === "file") return file(host, ref, ev);
  return youtube(host, ref, ev);
}
