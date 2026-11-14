"use client";

import { useState, type FormEvent } from "react";
import { describeConditions, noConditions, readConditions, recommend, type Conditions } from "../../../core/recommend";
import { useT } from "../../../i18n/client";

export type Usage = { paidEnabled: boolean; aiUsed: number; aiLimit: number; placesUsed: number; placesLimit: number; monthPercent: number };

// "도우미": says what the couple wants today and shows what fits. This step uses plain rules, no paid AI call.
export function Helper({ hasPartner, usage }: { hasPartner: boolean; usage: Usage | null }) {
  const { t } = useT();
  const [text, setText] = useState("");
  const [conditions, setConditions] = useState<Conditions>(noConditions);
  const [asked, setAsked] = useState(false);
  const chips = describeConditions(conditions).map((p) => t(p.key, p.vars));
  const picks = recommend(conditions);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (text.trim() === "") return;
    setConditions(readConditions(text, conditions));
    setAsked(true);
    setText("");
  }

  return (
    <div className="helper">
      <section className="sheet" aria-label={t("helper.ask")}>
        <h2>{t("helper.heading")}</h2>
        <form className="chat-form" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="helper-text">{t("helper.label")}</label>
          <input id="helper-text" autoComplete="off" placeholder={t("helper.placeholder")} value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="button" disabled={text.trim() === ""}>{t("helper.submit")}</button>
        </form>
        <p className="hint">{t("helper.hint")}</p>
        {chips.length > 0 && (
          <p className="helper-chips" aria-label={t("helper.now")}>
            {chips.map((c) => <span key={c} className="chip">{c}</span>)}{" "}
            <button type="button" className="link" onClick={() => { setConditions(noConditions); setAsked(false); }}>{t("helper.clear")}</button>
          </p>
        )}
      </section>

      <section className="sheet" aria-label={t("helper.picks")} aria-live="polite">
        {!asked && <p className="hint">{t("helper.anyTime")}</p>}
        {picks.length === 0 ? (
          <p role="status">{t("helper.none")}</p>
        ) : (
          <ul className="helper-list">
            {picks.map(({ activity, reasons }) => (
              <li key={activity.id} className="helper-pick">
                <h3>{t(`helper.act.${activity.id}.title`)}</h3>
                <p>{t(`helper.act.${activity.id}.about`)}</p>
                {reasons.length > 0 && <p className="hint">{reasons.map((r) => t(r.key, r.vars)).join(" · ")}</p>}
                <a className="button" href={activity.href}>{t("helper.open")}</a>
              </li>
            ))}
          </ul>
        )}
        {!hasPartner && <p className="hint">{t("helper.needPartner")}</p>}
      </section>

      <section className="sheet" aria-label={t("helper.aiState")}>
        <h2>{t("helper.ai")}</h2>
        {usage?.paidEnabled ? (
          <p className="hint">{t("helper.aiUsage", { used: usage.aiUsed, limit: usage.aiLimit })}{usage.monthPercent >= 80 ? " " + t("helper.aiAlmost") : ""}</p>
        ) : (
          <p className="hint">{t("helper.aiOff")}</p>
        )}
      </section>
    </div>
  );
}
