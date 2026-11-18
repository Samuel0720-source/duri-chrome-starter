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

// One reusable small window: it stays alive when the toolbar popup loses focus.
let opening;
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id || message?.duri!=="open-small")return;
  const url=sender.url || "";
  if(!url.startsWith(chrome.runtime.getURL("")) && !url.startsWith(webOrigin+"/"))return;
  const path=surfacePath(message.path);
  const destination=new URL(webOrigin+path); destination.searchParams.set("mini","1");
  const launch=async()=>{
    const {smallWindow}=await chrome.storage.session.get("smallWindow");
    if(smallWindow){
      try {
        const existing=await chrome.windows.get(smallWindow,{populate:true});
        // Never navigate an existing call away just because the popup is opened again.
        if(existing.type==="popup"){await chrome.windows.update(smallWindow,{focused:true});return;}
      }catch{/* Window was closed. */}
    }
    const win=await chrome.windows.create({url:destination.href,type:"popup",width:460,height:680});
    await chrome.storage.session.set({smallWindow:win.id});
  };
  if(!opening)opening=launch().finally(()=>{opening=null;});
  opening.then(()=>reply({ok:true}),()=>reply({ok:false}));
  return true;
});
