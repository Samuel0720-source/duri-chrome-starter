"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
export function SmallSurface() {
  const path = usePathname();
  useEffect(() => {
    if (window.top !== window) return;
    try {
      if (new URLSearchParams(location.search).get("mini") === "1") sessionStorage.setItem("duri-mini", "1");
      if (sessionStorage.getItem("duri-mini") === "1") document.documentElement.dataset.compact = "window";
    } catch { /* Storage can be disabled; layout is still responsive. */ }
  }, [path]);
  return null;
}
