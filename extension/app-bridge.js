// Packaged, isolated-world bridge that runs in Duri frames embedded by the toolbar popup.
// The website never receives extension APIs or credentials; only these messages cross:
//   frame -> popup:      { duri: "surface", path, locale, mood }   (where the popup should reopen)
//   page  -> extension:  { duri: "open-small" } | { duri: "allow-media" }
(() => {
  const extensionOrigin = chrome.runtime.getURL("").replace(/\/$/, "");
  const embedded = window.parent !== window && location.ancestorOrigins?.[0] === extensionOrigin;
  if (!embedded) return;

  const root = document.documentElement;
  if (root) root.dataset.compact = "popup";

  // After an extension reload or update, this old copy loses its runtime; fail quietly instead of
  // filling chrome://extensions with "Extension context invalidated" errors.
  function toExtension(message) {
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch { /* extension context invalidated */ }
  }

  let pending = false;
  let previous = "";
  function report() {
    pending = false;
    document.documentElement.dataset.compact = "popup";
    const mood = document.querySelector(".room[data-mood]")?.getAttribute("data-mood") || "berry";
    const surface = { duri: "surface", path: location.pathname + location.search, locale: document.documentElement.lang, mood };
    const key = JSON.stringify(surface);
    if (key === previous) return;
    previous = key;
    window.parent.postMessage(surface, extensionOrigin);
  }
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(report);
  }
  const openSmall = () => toExtension({ duri: "open-small", path: location.pathname + location.search });

  window.addEventListener("message", (e) => {
    if (e.source === parent && e.origin === extensionOrigin && e.data?.duri === "surface-request") {
      previous = "";
      schedule();
    }
    if (e.source !== window || e.origin !== location.origin) return;
    if (e.data?.duri === "open-small") openSmall();
    if (e.data?.duri === "allow-media") toExtension({ duri: "allow-media" });
  });
  // Forms marked for handoff (Google sign-in, file pickers) continue in the persistent small window.
  document.addEventListener("submit", (e) => {
    if (!(e.target instanceof HTMLFormElement) || !e.target.matches("[data-mini-handoff]")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openSmall();
  }, true);

  function start() {
    report();
    const observer = new MutationObserver((records) => {
      if (records.some((r) => r.type !== "attributes" || r.attributeName !== "data-compact")) schedule();
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["lang", "data-mood"] });
    window.addEventListener("popstate", schedule);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
