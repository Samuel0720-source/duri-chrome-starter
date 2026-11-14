import { fill, type Locale, type Vars } from "./core.ts";
import { ko } from "./messages/ko.ts";
import { en } from "./messages/en.ts";

export type MessageKey = keyof typeof ko;
export type Messages = Record<MessageKey, string>;
export type T = (key: MessageKey, vars?: Vars) => string;

const dictionaries: Record<Locale, Messages> = { ko, en };

// t("home.dayUnit") in the chosen language; a missing sentence falls back to Korean, then to the key.
export function makeT(locale: Locale): T {
  const dict = dictionaries[locale];
  return (key, vars) => fill(dict[key] ?? (ko as Messages)[key] ?? key, vars);
}
