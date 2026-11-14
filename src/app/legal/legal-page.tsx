import type { ReactNode } from "react";
import { getT } from "../../i18n/server";

// Shared frame for the privacy policy and the terms.
export async function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  const { t } = await getT();
  return (
    <main className="wrap auth legal">
      <header className="top">
        <a className="brand" href="/">
          <img alt="" width="32" height="32" src="/icons/icon-192.png" />
          {t("app.name")}
        </a>
      </header>
      <article className="sheet">
        <h1>{title}</h1>
        <p className="hint">{t("legal.updated", { date: updated })}</p>
        {children}
      </article>
    </main>
  );
}

export async function LegalLinks() {
  const { t } = await getT();
  return (
    <nav className="legal-links" aria-label={t("legal.links")}>
      <a href="/privacy">{t("legal.privacy")}</a>
      <a href="/terms">{t("legal.terms")}</a>
    </nav>
  );
}
