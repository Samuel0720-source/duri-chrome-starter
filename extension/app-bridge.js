// Packaged, isolated-world bridge. The website never receives extension APIs or credentials.
(() => {
  const extensionOrigin = chrome.runtime.getURL("").replace(/\/$/, "");
  const embedded = window.parent !== window && location.ancestorOrigins?.[0] === extensionOrigin;
  if (!embedded || location.pathname === "/call-host") return;
  const markRoot = () => {
    if (!document.documentElement) return false;
    document.documentElement.dataset.compact = "popup";
    document.documentElement.dataset.callBackground = "1";
    return true;
  };
  if (!markRoot()) {
    const rootObserver = new MutationObserver(() => { if (markRoot()) rootObserver.disconnect(); });
    rootObserver.observe(document, { childList: true });
  }
  let pending = false;
  let previous = "";
  function report() {
    pending=false;
    document.documentElement.dataset.compact="popup";
    document.documentElement.dataset.callBackground="1";
    if (location.pathname === "/login") void chrome.runtime.sendMessage({duri:"call-host-close"}).catch(()=>{});
    const mood=document.querySelector(".room[data-mood]")?.getAttribute("data-mood") || "berry";
    const surface = {duri:"surface",path:location.pathname+location.search,locale:document.documentElement.lang,mood};
    const key = JSON.stringify(surface);
    if (key === previous) return;
    previous = key;
    window.parent.postMessage(surface,extensionOrigin);
  }
  function schedule() { if (!pending) {pending=true;requestAnimationFrame(report);} }
  function small() { chrome.runtime.sendMessage({duri:"open-small",path:location.pathname+location.search}); }
  window.addEventListener("message",e=>{
    if (e.source===window && e.origin===location.origin && e.data?.duri==="call-host-ensure") {
      chrome.runtime.sendMessage({duri:"call-host-ensure"}).then(reply=>{
        if(!reply?.ok) window.postMessage({duri:"call-host-error"},location.origin);
      }).catch(()=>window.postMessage({duri:"call-host-error"},location.origin));
    }
    if (e.source===parent && e.origin===extensionOrigin && e.data?.duri==="surface-request") { previous=""; schedule(); }
    if (e.source===window && e.origin===location.origin && e.data?.duri==="open-small") small();
  });
  document.addEventListener("submit",e=>{if(e.target instanceof HTMLFormElement && e.target.matches("[data-mini-handoff]")){e.preventDefault();e.stopImmediatePropagation();small();}},true);
  const start=()=>{
    report();
    const observer=new MutationObserver(records=>{if(records.some(r=>r.type!=="attributes" || r.attributeName!=="data-compact"))schedule();});
    observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["lang","data-mood"]});
    window.addEventListener("popstate",schedule);
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true}); else start();
})();
