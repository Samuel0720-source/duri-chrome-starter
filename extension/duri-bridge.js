// Runs only on the 둘이 함께 보기 page (/room/watch). Lets that page know the extension is installed and
// relays to and from the switchboard (background.js). The page keeps doing the partner sync itself.
// Page -> here:  { duri: "to-ext", type: "ping" } or { duri: "to-ext", type: "cmd", cmd, sec }
// Here -> page:  { duri: "from-ext", type: "hello" | "link" | "state", ... }
(() => {
  const COMMANDS = new Set(["play", "pause", "seek"]);
  const toPage = (m) => window.postMessage({ duri: "from-ext", ...m }, location.origin);
  const hello = () => toPage({ type: "hello", version: chrome.runtime.getManifest().version });
  let port = null;

  function connect() {
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

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin || e.data?.duri !== "to-ext") return;
    if (e.data.type === "ping") return hello();
    if (e.data.type !== "cmd" || !COMMANDS.has(e.data.cmd)) return;
    const sec = e.data.cmd === "seek" ? Number(e.data.sec) : undefined;
    if (e.data.cmd === "seek" && !(sec >= 0 && sec < 86400)) return;
    try {
      port?.postMessage({ type: "cmd", cmd: e.data.cmd, sec });
    } catch {
      port = null;
    }
  });
})();
