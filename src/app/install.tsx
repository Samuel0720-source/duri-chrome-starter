"use client";
import { useEffect, useState } from "react";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallControl() {
  const [offer, setOffer] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const onDisplay = () => setInstalled(media.matches);
    const onOffer = (e: Event) => {
      e.preventDefault();
      setOffer(e as InstallEvent);
    };
    const done = () => {
      setInstalled(true);
      setOffer(null);
      setHelp(false);
    };
    onDisplay();
    media.addEventListener("change", onDisplay);
    window.addEventListener("beforeinstallprompt", onOffer);
    window.addEventListener("appinstalled", done);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Website remains usable when offline support is unavailable. */
      });
    return () => {
      media.removeEventListener("change", onDisplay);
      window.removeEventListener("beforeinstallprompt", onOffer);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  async function install() {
    if (!offer) {
      setHelp((value) => !value);
      return;
    }
    setOffer(null);
    try {
      await offer.prompt();
      const result = await offer.userChoice;
      setHelp(result.outcome === "dismissed");
    } catch {
      setHelp(true);
    }
  }
  if (installed) return <span className="install-state">설치된 앱</span>;
  return (
    <div className="install">
      <button aria-expanded={help} onClick={install}>
        앱 설치
      </button>
      {help && (
        <div className="install-help" role="status">
          컴퓨터 Chrome 메뉴에서 ‘전송, 저장 및 공유 → 페이지를 앱으로 설치’를 선택하세요.
          휴대폰에서는 브라우저 메뉴나 공유 메뉴의 ‘앱 설치’ 또는 ‘홈 화면에
          추가’를 찾아보세요.
        </div>
      )}
    </div>
  );
}
