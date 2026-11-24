import { webOrigin } from "./origin.js";
import { surfacePath } from "./surface-path.js";
// Netflix together: a tiny switchboard. The 둘이 함께 보기 tab ("duri") and a Netflix watch tab ("netflix")
// each open a port here. Commands from duri go to every Netflix tab; playback reports from Netflix go to
// every duri tab. Nothing is stored and nothing leaves this browser: the 둘이 page itself syncs with the partner.
const ports = { duri: new Set(), netflix: new Set() };

function tellDuri() {
  const link = { type: "link", netflix: ports.netflix.size > 0 };
  for (const p of ports.duri) p.postMessage(link);
}

chrome.runtime.onConnect.addListener((port) => {
  const mine = ports[port.name];
  if (!mine || port.sender?.id !== chrome.runtime.id) return port.disconnect();
  const other = port.name === "duri" ? ports.netflix : ports.duri;
  mine.add(port);
  tellDuri();
  port.onMessage.addListener((msg) => {
    for (const p of other) p.postMessage(msg);
  });
  port.onDisconnect.addListener(() => {
    mine.delete(port);
    tellDuri();
  });
});

// Open the SAME web app directly, without constructing a toolbar iframe first.
// Keep one window alive across icon clicks, so reopening never reloads a live call.
let opening;
let windowId;
const smallBounds = { width: 440, height: 600 };
async function fitSmall(id) {
  // Normalize separately: Chrome rejects dimensions on a maximized/fullscreen update.
  await chrome.windows.update(id, { state: "normal" });
  await chrome.windows.update(id, { ...smallBounds, focused: true });
}
const restored = chrome.storage.session.get("smallWindow").then(({ smallWindow }) => {
  windowId = smallWindow;
}).catch(() => {});
async function launch(path) {
  await restored;
  void chrome.action.setBadgeText({ text: "" });
  if (windowId) {
    let existing;
    try {
      existing = await chrome.windows.get(windowId);
    } catch { /* The previous small window was closed. */ }
    if (existing?.type === "popup") {
      // Do not navigate/reload the page or spawn a duplicate if resizing fails:
      // this window may already own the microphone and an active peer connection.
      await fitSmall(windowId);
      return;
    }
    windowId = undefined;
  }
  const destination = new URL(webOrigin + surfacePath(path));
  destination.searchParams.set("mini", "1");
  const win = await chrome.windows.create({ url: destination.href, type: "popup", state: "normal", ...smallBounds, focused: true });
  if (!win?.id) throw new Error("Chrome did not create the small window");
  windowId = win.id;
  await chrome.storage.session.set({ smallWindow: windowId });
  // Apply bounds after creation as well; never inherit a restored large window.
  await fitSmall(windowId);
}
function openSmall(path = "/room") {
  if (!opening) opening = launch(path).finally(() => { opening = undefined; });
  return opening;
}
chrome.action.onClicked.addListener(() => openSmall().catch(() => {
  // A visible retry indication instead of an unhandled service-worker rejection.
  void chrome.action.setBadgeText({ text: "!" });
}));
chrome.windows.onRemoved.addListener(id => {
  if (id === windowId) windowId = undefined;
});
// Messages from the popup and the embedded Duri frames (relayed by app-bridge.js).
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || !["open-small", "allow-media"].includes(message?.duri)) return;
  const url = sender.url || "";
  if (!url.startsWith(chrome.runtime.getURL("")) && !url.startsWith(webOrigin + "/")) return;
  const done = message.duri === "open-small"
    ? openSmall(message.path)
    // The toolbar popup cannot show Chrome's permission prompt; a normal extension tab can,
    // and the grant then also covers calls inside the popup.
    : chrome.tabs.create({ url: chrome.runtime.getURL("permission.html") });
  done.then(() => reply({ ok: true }), () => reply({ ok: false }));
  return true;
});
