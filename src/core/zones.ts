// Every time zone this browser knows, named the way the OS does ("Eastern Time"), not as a bare city.

export function computerZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; }
}

function part(zone: string, locale: string, style: "longGeneric" | "longOffset", at: Date): string {
  return new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: style })
    .formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
}

// "(UTC−05:00) Eastern Time · Toronto"; zones without a common name show only the offset and city.
export function zoneLabel(zone: string, locale: string, at = new Date()): string {
  const offset = part(zone, "en-US", "longOffset", at).replace("GMT", "UTC").replace(/^UTC$/, "UTC+00:00");
  const name = part(zone, locale, "longGeneric", at);
  const city = (zone.split("/").pop() ?? zone).replaceAll("_", " ");
  return name && !name.startsWith("GMT") ? `(${offset}) ${name} · ${city}` : `(${offset}) ${city}`;
}

function offsetMinutes(zone: string, at: Date): number {
  const m = /([+-])(\d\d):(\d\d)/.exec(part(zone, "en-US", "longOffset", at));
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

// All zones, west to east, plus any saved value the list lacks (e.g. "UTC").
export function zoneOptions(locale: string, keep: string[] = []): { value: string; label: string }[] {
  const at = new Date();
  let all: string[] = [];
  try { all = Intl.supportedValuesOf("timeZone"); } catch { /* very old browser: keep only the saved value */ }
  const values = [...new Set([...all, ...keep.filter(Boolean)])];
  return values
    .map((value) => ({ value, label: zoneLabel(value, locale, at), offset: offsetMinutes(value, at) }))
    .sort((a, b) => a.offset - b.offset || a.label.localeCompare(b.label))
    .map(({ value, label }) => ({ value, label }));
}
