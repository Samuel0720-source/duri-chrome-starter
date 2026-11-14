import { cookies, headers } from "next/headers";
import { LANG_COOKIE, pickLocale, type Locale } from "./core";
import { makeT } from "./dict";

// The language of this request: the saved choice (cookie), else the browser's language.
export async function getLocale(): Promise<Locale> {
  const [store, head] = await Promise.all([cookies(), headers()]);
  return pickLocale(store.get(LANG_COOKIE)?.value, head.get("accept-language"));
}

export async function getT() {
  const locale = await getLocale();
  return { locale, t: makeT(locale) };
}
