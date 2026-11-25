"use client";
import { useEffect, useMemo, useState } from "react";
import { defaultZone } from "../core/preview";
import { computerZone, zoneLabel, zoneOptions } from "../core/zones";
import { useT } from "../i18n/client";

// Time zone control. When the zone already matches this computer, it shows one line and a "Change" button;
// the full world list appears only when someone wants a different zone.
// Uncontrolled forms pass `name` (+ `defaultValue`, else the computer's zone); the preview passes value/onChange.
export function ZoneField({ id, name, defaultValue, value, onChange }: {
  id: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (zone: string) => void;
}) {
  const { t, locale } = useT();
  const [here, setHere] = useState<string>();
  const [own, setOwn] = useState(defaultValue);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const zone = computerZone();
    setHere(zone);
    setOwn((saved) => saved ?? zone);
  }, []);
  const zone = value ?? own ?? defaultZone;
  // Labels come from the browser's Intl data, so build them only after mount (no server/client mismatch).
  const options = useMemo(() => (here === undefined ? [] : zoneOptions(locale, [zone])), [here, locale, zone]);
  const matches = !editing && here !== undefined && zone === here;
  return (
    <>
      <label htmlFor={id}>{t("settings.room.zone")}</label>
      {matches && (
        <p className="zone-auto">
          <span>{t("zone.auto", { zone: zoneLabel(zone, locale) })}</span>
          <button type="button" className="link" onClick={() => setEditing(true)}>{t("zone.change")}</button>
        </p>
      )}
      <select id={id} name={name} value={zone} hidden={matches}
        onChange={(e) => { setOwn(e.target.value); onChange?.(e.target.value); }}>
        {options.length ? options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>) : <option value={zone}>{zone}</option>}
      </select>
    </>
  );
}
