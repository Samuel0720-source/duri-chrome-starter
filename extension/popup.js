import { webOrigin } from "./origin.js";
import { surfacePath } from "./surface-path.js";
const app = document.querySelector("#app");
const state = document.querySelector("#state");
let path = "/room";
let locale = navigator.language.startsWith("ko") ? "ko" : "en";
let failed = false;
function labels() {
  const ko = locale === "ko";
  document.documentElement.lang = locale;
  document.querySelector("#name").textContent = ko ? "둘이" : "Duri";
  const words = { reload:ko ? "새로고침" : "Refresh", detach:ko ? "작은 창으로 계속하기" : "Keep open in a small window", full:ko ? "전체 웹앱" : "Open full app" };
  for (const [id,text] of Object.entries(words)) { const b=document.getElementById(id); b.title=text; b.setAttribute("aria-label",text); }
  state.textContent = failed ? (ko ? "연결을 확인한 뒤 새로고침하거나 작은 창으로 열어 주세요." : "Check your connection, refresh, or open in a small window.") : (ko ? "우리 방을 여는 중…" : "Opening your room…");
}
labels();
const saved = await chrome.storage.local.get("surface");
if (saved.surface) { path=surfacePath(saved.surface.path); if (["ko","en"].includes(saved.surface.locale)) locale=saved.surface.locale; if (["berry","forest","cafe","sunset","night"].includes(saved.surface.mood)) document.documentElement.dataset.mood=saved.surface.mood; labels(); }
let timer;
function open() { failed=false; state.hidden=false; labels(); app.src=webOrigin+path; clearTimeout(timer); timer=setTimeout(()=>{failed=true;labels();},15000); }
window.addEventListener("message", e => {
  if (e.origin !== webOrigin || e.source !== app.contentWindow || e.data?.duri !== "surface") return;
  path=surfacePath(e.data.path);
  if (["ko","en"].includes(e.data.locale)) locale=e.data.locale;
  const mood=["berry","forest","cafe","sunset","night"].includes(e.data.mood) ? e.data.mood : "berry";
  document.documentElement.dataset.mood=mood; document.body.dataset.mood=mood; labels(); state.hidden=true; clearTimeout(timer);
  chrome.storage.local.set({surface:{path,locale,mood}});
});
app.addEventListener("load",()=>app.contentWindow.postMessage({duri:"surface-request"},webOrigin));
document.querySelector("#reload").addEventListener("click",open);
document.querySelector("#full").addEventListener("click",()=>chrome.tabs.create({url:webOrigin+path}));
document.querySelector("#detach").addEventListener("click",()=>chrome.runtime.sendMessage({duri:"open-small",path}).catch(()=>{failed=true;state.hidden=false;labels();}));
open();
