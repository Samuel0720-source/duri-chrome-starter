"use client";
import { useEffect, useState } from "react";
import { useT } from "../i18n/client";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallControl() {
  const { t } = useT();
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
  if (installed) return <span className="install-state">{t("install.installed")}</span>;
  return (
    <div className="install">
      <button aria-expanded={help} onClick={install}>
        {t("install.button")}
      </button>
      {help && (
        <div className="install-help" role="status">
          {t("install.howto")}
        </div>
      )}
    </div>
  );
}
