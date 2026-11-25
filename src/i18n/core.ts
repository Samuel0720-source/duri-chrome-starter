// Tiny translation core (no library): a flat dictionary per language, {name} placeholders, and Korean
// particles that follow the last letter of a nickname, e.g. "{name}{이/가}" -> "민준이가" / "지수가".
export const locales = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
] as const;
export type Locale = (typeof locales)[number]["value"];
export const defaultLocale: Locale = "ko";
export const LANG_COOKIE = "duri_lang";

export function isLocale(value: unknown): value is Locale {
  return locales.some((l) => l.value === value);
}

// The browser's main language decides: Korean first -> Korean, anything else (or nothing) -> English.
// A saved choice (cookie) always wins.
export function pickLocale(cookie: string | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  const first = (acceptLanguage ?? "").split(",")[0].split(";")[0].trim().toLowerCase().split("-")[0];
  return first === "ko" ? "ko" : "en";
}

// Does the last Hangul syllable have a final consonant (받침)? null when the last letter is not Hangul.
export function hasBatchim(word: string): boolean | null {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return null;
  return (code - 0xac00) % 28 !== 0;
}

const PARTICLES: Record<string, [string, string]> = {
  // token: [after a final consonant, after a vowel]
  "이/가": ["이", "가"],
  "은/는": ["은", "는"],
  "을/를": ["을", "를"],
  "과/와": ["과", "와"],
  "아/야": ["아", "야"],
  "이": ["이", ""], // casual name ending: 민준 -> 민준이는, 지수 -> 지수는
};

export function josa(word: string, token: keyof typeof PARTICLES | string): string {
  const pair = PARTICLES[token];
  if (!pair) return "";
  const b = hasBatchim(word);
  if (b === null) return token === "이" ? "" : `${pair[0]}(${pair[1]})`.replace("()", "");
  return b ? pair[0] : pair[1];
}

export type Vars = Record<string, string | number>;

// "{name}{이/가} 골랐어요" with name=민준 -> "민준이 골랐어요".
export function fill(template: string, vars?: Vars): string {
  let out = "";
  let last = "";
  const re = /\{([^{}]+)\}/g;
  let i = 0;
  for (let m = re.exec(template); m; m = re.exec(template)) {
    out += template.slice(i, m.index);
    const key = m[1];
    if (key in PARTICLES) {
      out += josa(last, key);
    } else if (vars && key in vars) {
      last = String(vars[key]);
      out += last;
    } else {
      out += m[0];
    }
    i = re.lastIndex;
  }
  return out + template.slice(i);
}

