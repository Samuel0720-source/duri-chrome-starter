import { webOrigin } from "./origin.js";
import { surfacePath } from "./surface-path.js";

const app = document.querySelector("#app");
const state = document.querySelector("#state");
const MOODS = ["berry", "forest", "cafe", "sunset", "night"];
let path = "/room";
let locale = navigator.language.startsWith("ko") ? "ko" : "en";
let failed = false;

function labels() {
  const ko = locale === "ko";
  document.documentElement.lang = locale;
  document.querySelector("#name").textContent = ko ? "둘이" : "Duri";
  const words = {
    reload: ko ? "새로고침" : "Refresh",
    detach: ko ? "작은 창으로 계속하기" : "Keep open in a small window",
    full: ko ? "전체 웹앱" : "Open full app",
  };
  for (const [id, text] of Object.entries(words)) {
    const button = document.getElementById(id);
    button.title = text;
    button.setAttribute("aria-label", text);
  }
  state.textContent = failed
    ? (ko ? "연결을 확인한 뒤 새로고침하거나 작은 창으로 열어 주세요." : "Check your connection, refresh, or open in a small window.")
    : (ko ? "우리 방을 여는 중…" : "Opening your room…");
}

function applyMood(mood) {
  const value = MOODS.includes(mood) ? mood : "berry";
  document.documentElement.dataset.mood = value;
  document.body.dataset.mood = value;
}

// Only navigation/presentation preferences are cached here, never chat or credentials.
function restore(surface) {
  if (!surface) return;
  path = surfacePath(surface.path);
  if (["ko", "en"].includes(surface.locale)) locale = surface.locale;
  if (MOODS.includes(surface.mood)) applyMood(surface.mood);
  labels();
}

let timer;
function open() {
  failed = false;
  state.hidden = false;
  labels();
  app.src = webOrigin + path;
  clearTimeout(timer);
  timer = setTimeout(() => { failed = true; labels(); }, 15000);
}

// The embedded room (app-bridge.js) reports where it is, so the next popup reopens there.
window.addEventListener("message", (e) => {
  if (e.origin !== webOrigin || e.source !== app.contentWindow || e.data?.duri !== "surface") return;
  path = surfacePath(e.data.path);
  if (["ko", "en"].includes(e.data.locale)) locale = e.data.locale;
  applyMood(e.data.mood);
  labels();
  state.hidden = true;
  clearTimeout(timer);
  const surface = { path, locale, mood: document.body.dataset.mood };
  try { localStorage.setItem("duri-surface", JSON.stringify(surface)); } catch { /* Optional cache. */ }
  void chrome.storage.local.set({ surface }).catch(() => {});
});
app.addEventListener("load", () => app.contentWindow.postMessage({ duri: "surface-request" }, webOrigin));

document.querySelector("#reload").addEventListener("click", open);
document.querySelector("#full").addEventListener("click", () => chrome.tabs.create({ url: webOrigin + path }));
document.querySelector("#detach").addEventListener("click", async () => {
  try {
    const reply = await chrome.runtime.sendMessage({ duri: "open-small", path });
    if (!reply?.ok) throw new Error("Window did not open");
  } catch {
    failed = true;
    state.hidden = false;
    labels();
  }
});

labels();
let cached;
try { cached = JSON.parse(localStorage.getItem("duri-surface") || "null"); } catch { /* Optional cache. */ }
restore(cached);

// First install can migrate the old settings, but never wait indefinitely for storage.
// A late storage result must not replace the screen the user has already opened.
if (cached) open();
else {
  let started = false;
  const start = (surface) => {
    if (started) return;
    started = true;
    restore(surface);
    open();
  };
  const deadline = setTimeout(() => start(), 100);
  chrome.storage.local.get("surface").then(
    (saved) => { clearTimeout(deadline); start(saved.surface); },
    () => { clearTimeout(deadline); start(); },
  );
}
