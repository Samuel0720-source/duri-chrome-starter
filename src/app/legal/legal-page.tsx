import type { ReactNode } from "react";

// Shared frame for the privacy policy and the terms.
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="wrap auth legal">
      <header className="top">
        <a className="brand" href="/">
          <img alt="" width="32" height="32" src="/icons/icon-192.png" />
          둘이
        </a>
      </header>
      <article className="sheet">
        <h1>{title}</h1>
        <p className="hint">최종 수정일 {updated}</p>
        {children}
      </article>
    </main>
  );
}

export function LegalLinks() {
  return (
    <nav className="legal-links" aria-label="정책">
      <a href="/privacy">개인정보처리방침</a>
      <a href="/terms">이용약관</a>
    </nav>
  );
}
