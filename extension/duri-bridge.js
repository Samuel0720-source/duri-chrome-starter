// Runs only on Duri's /room/watch and /room/draw pages.
//  * /room/watch: relays playback commands & state to/from the Netflix switchboard (background.js).
//  * /room/draw:  stores or clears the scoped collaborative sketch token in chrome.storage.local.
(() => {
  const isWatch = location.pathname.startsWith("/room/watch");
  const isDraw = location.pathname.startsWith("/room/draw");
  const COMMANDS = new Set(["play", "pause", "seek"]);
  const toPage = (m) => window.postMessage({ duri: "from-ext", ...m }, location.origin);
  const hello = () => toPage({ type: "hello", version: chrome.runtime.getManifest().version });
  let port = null;

  function connect() {
    if (!isWatch) return;
    try {
      port = chrome.runtime.connect({ name: "duri" });
    } catch {
      port = null;
      return;
    }
    port.onMessage.addListener((m) => {
      if (m?.type === "link") toPage({ type: "link", netflix: Boolean(m.netflix) });
      else if (m?.type === "state" && Number.isFinite(m.time) && [0, 1, 2, 3].includes(m.state)) {
        toPage({ type: "state", time: m.time, state: m.state, id: m.id ?? null });
      }
    });
    port.onDisconnect.addListener(() => {
      port = null;
      toPage({ type: "link", netflix: false });
      setTimeout(connect, 1000);
    });
  }
  connect();
  hello();

  function parseBridge(raw) {
    if (!raw) return null;
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return typeof raw === "object" ? raw : null;
  }

  async function reportSketchStatus() {
    if (!isDraw) return;
    try {
      const res = await chrome.storage.local.get("sketchBridge");
      const bridge = parseBridge(res?.sketchBridge);
      const paired = Boolean(bridge?.token && bridge?.origin === location.origin);
      toPage({ type: "sketch-status", paired });
    } catch {
      toPage({ type: "sketch-status", paired: false });
    }
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin || e.data?.duri !== "to-ext") return;
    if (e.data.type === "ping") return hello();

    if (isDraw) {
      if (e.data.type === "sketch-status") {
        void reportSketchStatus();
        return;
      }
      if (e.data.type === "sketch-pair") {
        const token = typeof e.data.token === "string" ? e.data.token : "";
        const partnerName = typeof e.data.partnerName === "string" ? e.data.partnerName.slice(0, 30) : "";
        if (!/^[0-9a-f]{64}$/.test(token)) return;
        const payload = JSON.stringify({ token, origin: location.origin, partnerName });
        void chrome.storage.local
          .set({ sketchBridge: payload })
          .then(() => toPage({ type: "sketch-status", paired: true }))
          .catch(() => toPage({ type: "sketch-status", paired: false }));
        return;
      }
      if (e.data.type === "sketch-unpair") {
        void chrome.storage.local
          .remove("sketchBridge")
          .then(() => toPage({ type: "sketch-status", paired: false }))
          .catch(() => undefined);
        return;
      }
    }

    if (!isWatch || e.data.type !== "cmd" || !COMMANDS.has(e.data.cmd)) return;
    const sec = e.data.cmd === "seek" ? Number(e.data.sec) : undefined;
    if (e.data.cmd === "seek" && !(sec >= 0 && sec < 86400)) return;
    try {
      port?.postMessage({ type: "cmd", cmd: e.data.cmd, sec });
    } catch {
      port = null;
    }
  });
})();
