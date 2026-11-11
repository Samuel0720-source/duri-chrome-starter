"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserClient } from "../../../lib/supabase/browser";
import { roomErrorMessage } from "../../../core/auth-paths";
import { guessQuestions, type GuessRound, type GuessState } from "../../../core/guess";

// "상대 선택 맞히기". The browser only ever receives what guess_state() allows:
// a partner's answer for a round arrives after both have answered that round.
export function GuessGame({ roomId, initial }: { roomId: string; initial: GuessState }) {
  const [state, setState] = useState<GuessState>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const supabaseRef = useRef<ReturnType<typeof browserClient>>(null);

  const refresh = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const { data } = await supabase.rpc("guess_state", { target: roomId });
    if (data) setState(data as GuessState);
  }, [roomId]);

  useEffect(() => {
    const supabase = browserClient();
    supabaseRef.current = supabase;
    if (!supabase) return;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    (async () => {
      await supabase.realtime.setAuth();
      if (!active) return;
      channel = supabase
        .channel("room:" + roomId, { config: { private: true } })
        .on("broadcast", { event: "guess" }, () => refresh())
        .on("broadcast", { event: "members" }, () => window.location.reload())
        .subscribe((status) => {
          document.documentElement.dataset.roomLive = status === "SUBSCRIBED" ? "on" : "off";
          if (status === "SUBSCRIBED") refresh();
        });
    })();
    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId, refresh]);

  async function call(fn: string, args: Record<string, unknown>) {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    setBusy(true);
    const { error: failure } = await supabase.rpc(fn, args);
    setBusy(false);
    if (failure) setError(roomErrorMessage(failure.message));
    else setError("");
    await refresh();
  }

  if (!state.game) {
    return (
      <section className="sheet guess-intro">
        <h2>상대 선택 맞히기</h2>
        <p className="lead">질문 세 개. 내 답과, 상대가 고를 답을 함께 적어요. 둘 다 답해야 서로의 답이 열려요.</p>
        <button type="button" className="button" disabled={busy} onClick={() => call("start_guess_game", { target: roomId })}>게임 시작</button>
        {error && <p role="alert" className="error">{error}</p>}
      </section>
    );
  }

  return (
    <div className="guess">
      {state.finished && (
        <section className="sheet guess-score" aria-live="polite">
          <h2>결과</h2>
          <p className="score-line">
            <span>내가 맞힌 수</span> <strong>{state.score.me}</strong>
            <span>상대가 맞힌 수</span> <strong>{state.score.partner}</strong>
          </p>
          <button type="button" className="button" disabled={busy} onClick={() => call("start_guess_game", { target: roomId })}>새 게임</button>
        </section>
      )}
      <ol className="guess-rounds">
        {state.rounds.map((r) => (
          <Round key={state.game + ":" + r.round} game={state.game} round={r} busy={busy} onAnswer={call} />
        ))}
      </ol>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

function Round({ game, round, busy, onAnswer }: {
  game: string; round: GuessRound; busy: boolean;
  onAnswer: (fn: string, args: Record<string, unknown>) => Promise<void>;
}) {
  const item = guessQuestions[round.question];
  const [own, setOwn] = useState<number | null>(null);
  const [guess, setGuess] = useState<number | null>(null);
  if (!item) return null;
  const name = (i: number) => item.options[i];

  return (
    <li className="sheet guess-round" data-round={round.round}>
      <p className="round-no">{round.round}번째 질문</p>
      <h3>{item.q}</h3>
      {round.mine ? (
        <div className="round-result">
          <p>나의 선택 <strong>{name(round.mine.own)}</strong></p>
          <p>내 예상 <strong>{name(round.mine.guess)}</strong></p>
          {round.partner ? (
            <>
              <p>상대의 선택 <strong>{name(round.partner.own)}</strong></p>
              <p className={round.mine.guess === round.partner.own ? "hit" : "miss"}>
                {round.mine.guess === round.partner.own ? "맞혔어요!" : "아쉬워요. 다음엔 맞힐 거예요."}
              </p>
              <p className="hint">상대는 내가 {name(round.partner.guess)}을(를) 고를 거라고 예상했어요.</p>
            </>
          ) : (
            <p className="waiting">상대의 답을 기다리는 중이에요. 답이 오면 바로 열려요.</p>
          )}
        </div>
      ) : (
        <form
          className="round-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (own === null || guess === null) return;
            onAnswer("answer_guess", { game, round_no: round.round, own, guess });
          }}
        >
          {round.partnerAnswered && <p className="hint">상대는 이미 답했어요.</p>}
          <fieldset>
            <legend>나의 선택</legend>
            <div className="choice-grid">
              {item.options.map((o, i) => (
                <label key={o} className="choice">
                  <input type="radio" name={"own-" + round.round} value={i} checked={own === i} onChange={() => setOwn(i)} />
                  <span>{o}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>상대는 무엇을 골랐을까요?</legend>
            <div className="choice-grid">
              {item.options.map((o, i) => (
                <label key={o} className="choice">
                  <input type="radio" name={"guess-" + round.round} value={i} checked={guess === i} onChange={() => setGuess(i)} />
                  <span>{o}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="button" disabled={busy || own === null || guess === null}>답 제출</button>
        </form>
      )}
    </li>
  );
}
