import { webOrigin } from "./origin.js";
const frame = document.getElementById("call-host");
frame.src = webOrigin + "/call-host";
window.addEventListener("message", event => {
  if (event.source !== frame.contentWindow || event.origin !== webOrigin) return;
  const message = event.data;
  if (message?.duri === "call-host-state" && ["idle", "incoming", "ringing", "connecting", "connected"].includes(message.phase))
    void chrome.runtime.sendMessage({ duri: "call-host-state", phase: message.phase }).catch(() => {});
  if (message?.duri === "call-host-close") void chrome.runtime.sendMessage({ duri: "call-host-close" }).catch(() => {});
});
