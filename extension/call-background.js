// One hidden media document per Chrome profile. No tokens or SDP cross this API.
let creating;
async function ensureHost() {
  if (!creating) creating = (async () => {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [chrome.runtime.getURL("offscreen.html")] });
    if (!contexts.length) await chrome.offscreen.createDocument({
      url: "offscreen.html", reasons: ["WEB_RTC", "USER_MEDIA"],
      justification: "Keep the couple's voice/video call connected when the toolbar popup closes.",
    });
  })().finally(() => { creating = undefined; });
  return creating;
}
export function callMessage(message, sender, reply, origin) {
  const host = sender.url === chrome.runtime.getURL("offscreen.html");
  if (message.duri === "call-host-ensure" && sender.url?.startsWith(origin + "/room")) {
    ensureHost().then(() => reply({ ok: true }), () => reply({ ok: false })); return true;
  }
  if (message.duri === "call-host-close" && (host || sender.url?.startsWith(origin + "/login"))) {
    chrome.offscreen.closeDocument().catch(() => {}).finally(() => chrome.action.setBadgeText({ text: "" }));
  }
  if (message.duri === "call-host-state" && host) {
    void chrome.action.setBadgeText({ text: message.phase === "idle" ? "" : "☎" });
    void chrome.action.setBadgeBackgroundColor({ color: "#a63568" });
  }
}
