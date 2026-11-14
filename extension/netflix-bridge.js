// Runs in the Netflix watch tab next to netflix-player.js, in the extension's own isolated world.
// Passes playback reports to the switchboard (background.js) and commands back to the player.
// Only these fields cross: a play state, a time in seconds and the title number. No account or page data.
(() => {
  const COMMANDS = new Set(["play", "pause", "seek"]);
  let port = null;

  function connect() {
    try {
      port = chrome.runtime.connect({ name: "netflix" });
    } catch {
      port = null; // the extension was updated or removed; this old copy stops quietly
      return;
    }
    port.onMessage.addListener((m) => {
      if (m?.type !== "cmd" || !COMMANDS.has(m.cmd)) return;
      const sec = m.cmd === "seek" ? Number(m.sec) : undefined;
      if (m.cmd === "seek" && !(sec >= 0 && sec < 86400)) return;
      window.postMessage({ duri: "netflix-cmd", cmd: m.cmd, sec }, location.origin);
    });
    port.onDisconnect.addListener(() => {
      port = null;
      setTimeout(connect, 1000); // the switchboard restarts after Chrome puts it to sleep
    });
  }
  connect();

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin || e.data?.duri !== "netflix-state") return;
    const { time, state, id } = e.data;
    if (!Number.isFinite(time) || ![0, 1, 2, 3].includes(state)) return;
    try {
      port?.postMessage({ type: "state", time, state, id: typeof id === "string" && /^\d{5,12}$/.test(id) ? id : null });
    } catch {
      port = null;
    }
  });
})();
