import { locales, type Locale } from "../i18n/core";
import { setLanguage } from "../i18n/actions";

// A small form that saves the language on this device; usable before and after signing in.
export function LanguageForm({ current, back, label, button, compact = false }: { current: Locale; back: string; label: string; button: string; compact?: boolean }) {
  return (
    <form action={setLanguage} className={compact ? "lang-form compact" : "lang-form"}>
      <input type="hidden" name="back" value={back} />
      <label htmlFor={compact ? "lang-top" : "lang"} className={compact ? "visually-hidden" : undefined}>{label}</label>
      <select id={compact ? "lang-top" : "lang"} name="lang" defaultValue={current}>
        {locales.map((l) => <option key={l.value} value={l.value} lang={l.value}>{l.label}</option>)}
      </select>
      <button type="submit" className="secondary">{button}</button>
    </form>
  );
}
