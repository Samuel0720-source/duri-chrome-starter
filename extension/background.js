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
