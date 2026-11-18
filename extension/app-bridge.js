// Packaged, isolated-world bridge. The website never receives extension APIs or credentials.
(() => {
  const extensionOrigin = chrome.runtime.getURL("").replace(/\/$/, "");
  const embedded = window.parent !== window && location.ancestorOrigins?.[0] === extensionOrigin;
  if (!embedded) return;
  let pending = false;
  function report() {
    pending=false;
    document.documentElement.dataset.compact="popup";
    const mood=document.querySelector(".room[data-mood]")?.getAttribute("data-mood") || "berry";
    window.parent.postMessage({duri:"surface",path:location.pathname+location.search,locale:document.documentElement.lang,mood},extensionOrigin);
  }
  function schedule() { if (!pending) {pending=true;requestAnimationFrame(report);} }
  function small() { chrome.runtime.sendMessage({duri:"open-small",path:location.pathname+location.search}); }
  window.addEventListener("message",e=>{
    if (e.source===parent && e.origin===extensionOrigin && e.data?.duri==="surface-request") schedule();
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
