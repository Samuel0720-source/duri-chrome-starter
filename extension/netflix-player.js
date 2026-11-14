// Runs inside the Netflix watch page itself (Chrome's "MAIN" world), because only there is Netflix's own
// player object reachable. Setting <video>.currentTime directly makes Netflix stop with an error, so seeking
// uses Netflix's player; play/pause/time fall back to the <video> element if that object ever changes.
// It talks only to netflix-bridge.js in the same tab, through window messages.
(() => {
  if (window.__duriNetflix) return;
  window.__duriNetflix = true;

  function player() {
    try {
      const vp = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
      const ids = vp.getAllPlayerSessionIds();
      const id = ids.find((s) => s.startsWith("watch")) ?? ids[ids.length - 1];
      return id ? vp.getVideoPlayerBySessionId(id) : null;
    } catch {
      return null;
    }
  }
  const video = () => document.querySelector("video");

  // State numbers as in the 둘이 page: 0 ended, 1 playing, 2 paused, 3 buffering.
  function report() {
    const v = video();
    const p = player();
    if (!v && !p) return;
    let time = v ? v.currentTime : 0;
    let paused = v ? v.paused : true;
    try {
      if (p) {
        time = p.getCurrentTime() / 1000;
        paused = p.isPaused();
      }
    } catch {
      // keep the <video> values
    }
    const buffering = Boolean(v && !paused && v.readyState < 3);
    const state = v?.ended ? 0 : buffering ? 3 : paused ? 2 : 1;
    const id = (location.pathname.match(/\/watch\/(\d+)/) || [])[1] ?? null;
    window.postMessage({ duri: "netflix-state", time, state, id }, location.origin);
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin || e.data?.duri !== "netflix-cmd") return;
    const { cmd, sec } = e.data;
    const p = player();
    const v = video();
    try {
      if (cmd === "play") p ? p.play() : v?.play();
      else if (cmd === "pause") p ? p.pause() : v?.pause();
      else if (cmd === "seek" && Number.isFinite(sec) && sec >= 0 && sec < 86400) {
        if (p) p.seek(Math.round(sec * 1000));
        else if (v) v.currentTime = sec;
      }
    } catch {
      // Netflix refused (for example, still loading); the next report shows the real state.
    }
    setTimeout(report, 200);
  });

  for (const type of ["play", "pause", "playing", "waiting", "seeked", "ended"]) document.addEventListener(type, report, true);
  setInterval(report, 1000);
})();
