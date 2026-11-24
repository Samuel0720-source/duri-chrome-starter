"use client";

import { useEffect } from "react";
import { useT } from "../i18n/client";

// Any screen that throws shows this instead of a blank "Application error" page.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useT();
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="error-page" role="alert">
      <h1>{t("error.title")}</h1>
      <p>{t("error.body")}</p>
      <div className="error-actions">
        <button type="button" className="button" onClick={reset}>{t("error.retry")}</button>
        <a className="button" href="/room">{t("error.home")}</a>
      </div>
    </main>
  );
}
