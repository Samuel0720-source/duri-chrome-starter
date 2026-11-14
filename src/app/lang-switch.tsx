"use client";

import { locales } from "../i18n/core";
import { setLanguage } from "../i18n/actions";
import { useT } from "../i18n/client";

// A compact language picker for the top bar: choosing a language applies it at once (no button needed).
export function LangSwitch({ back }: { back: string }) {
  const { t, locale } = useT();
  return (
    <form action={setLanguage} className="lang-switch">
      <input type="hidden" name="back" value={back} />
      <label htmlFor="lang-switch" className="visually-hidden">{t("settings.lang.title")} · Language</label>
      <select id="lang-switch" name="lang" defaultValue={locale} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {locales.map((l) => <option key={l.value} value={l.value} lang={l.value}>{l.label}</option>)}
      </select>
      <noscript><button type="submit" className="secondary">{t("settings.lang.apply")}</button></noscript>
    </form>
  );
}
