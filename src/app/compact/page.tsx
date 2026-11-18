"use client";
import { useEffect } from "react";
export default function CompactPage() {
  useEffect(()=>{window.location.replace(location.hash.startsWith("#start=") ? "/compact/calendar"+location.hash : "/room?mini=1");},[]);
  return <main className="wrap"><p role="status">Duri · 둘이</p></main>;
}
