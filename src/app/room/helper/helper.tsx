"use client";

import { useState, type FormEvent } from "react";
import { describeConditions, noConditions, readConditions, recommend, type Conditions } from "../../../core/recommend";

export type Usage = { paidEnabled: boolean; aiUsed: number; aiLimit: number; placesUsed: number; placesLimit: number; monthPercent: number };

// "도우미": says what the couple wants today and shows what fits. This step uses plain rules, no paid AI call.
export function Helper({ hasPartner, usage }: { hasPartner: boolean; usage: Usage | null }) {
  const [text, setText] = useState("");
  const [conditions, setConditions] = useState<Conditions>(noConditions);
  const [asked, setAsked] = useState(false);
  const chips = describeConditions(conditions);
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
      <section className="sheet" aria-label="오늘 하고 싶은 것">
        <h2>오늘 뭐 할까요?</h2>
        <form className="chat-form" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="helper-text">원하는 조건</label>
          <input id="helper-text" autoComplete="off" placeholder="예: 10분, 경쟁은 싫어" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="button" disabled={text.trim() === ""}>추천받기</button>
        </form>
        <p className="hint">시간(“20분”), “경쟁은 싫어”, “말 안 해도 되는 걸로”를 알아들어요. 조건은 이어서 쌓여요.</p>
        {chips.length > 0 && (
          <p className="helper-chips" aria-label="지금 조건">
            {chips.map((c) => <span key={c} className="chip">{c}</span>)}{" "}
            <button type="button" className="link" onClick={() => { setConditions(noConditions); setAsked(false); }}>조건 지우기</button>
          </p>
        )}
      </section>

      <section className="sheet" aria-label="추천" aria-live="polite">
        {!asked && <p className="hint">조건을 말하지 않아도 지금 할 수 있는 활동은 아래와 같아요.</p>}
        {picks.length === 0 ? (
          <p role="status">그 조건에 맞는 활동이 지금은 없어요. 시간을 늘리거나 조건을 하나 지워 보세요.</p>
        ) : (
          <ul className="helper-list">
            {picks.map(({ activity, reasons }) => (
              <li key={activity.id} className="helper-pick">
                <h3>{activity.title}</h3>
                <p>{activity.about}</p>
                {reasons.length > 0 && <p className="hint">{reasons.join(" · ")}</p>}
                <a className="button" href={activity.href}>이 활동 열기</a>
              </li>
            ))}
          </ul>
        )}
        {!hasPartner && <p className="hint">상대가 방에 들어오면 같이 시작할 수 있어요.</p>}
      </section>

      <section className="sheet" aria-label="AI 사용 상태">
        <h2>AI 도우미</h2>
        {usage?.paidEnabled ? (
          <p className="hint">오늘 AI 사용 {usage.aiUsed}/{usage.aiLimit}회{usage.monthPercent >= 80 ? " · 이번 달 한도가 거의 찼어요" : ""}</p>
        ) : (
          <p className="hint">AI 연결은 꺼져 있어요(예산 설정 전). 위 추천은 AI 없이 규칙으로 만든 것이고, 게임·달력은 AI 없이도 다 쓸 수 있어요.</p>
        )}
      </section>
    </div>
  );
}
