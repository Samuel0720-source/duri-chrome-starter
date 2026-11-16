"use client";

import { useRoomChannel } from "../use-room-channel";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "../../../lib/supabase/browser";
import { roomErrorKey } from "../../../core/auth-paths";
import { guessQuestionsEn } from "../../../core/guess-en";
import { useT } from "../../../i18n/client";
import { guessQuestions, type GuessRound, type GuessState } from "../../../core/guess";

// "상대 선택 맞히기". The browser only ever receives what guess_state() allows:
// a partner's answer for a round arrives after both have answered that round.
export function GuessGame({ roomId, initial, partnerName }: { roomId: string; initial: GuessState; partnerName: string }) {
  const { t } = useT();
  const router = useRouter();
  const roomChannel = useRoomChannel(roomId);
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
      channel = roomChannel(supabase)
        .on("broadcast", { event: "guess" }, () => refresh())
        .on("broadcast", { event: "members" }, () => router.refresh())
        .subscribe((status) => {
          document.documentElement.dataset.roomLive = status === "SUBSCRIBED" ? "on" : "off";
          if (status === "SUBSCRIBED") refresh();
        });
    })();
    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomChannel, roomId, refresh, router]);

  async function call(fn: string, args: Record<string, unknown>) {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    setBusy(true);
    const { error: failure } = await supabase.rpc(fn, args);
    setBusy(false);
    if (failure) setError(t(roomErrorKey(failure.message)));
    else setError("");
    await refresh();
  }

  if (!state.game) {
    return (
      <section className="sheet guess-intro">
        <h2>{t("guess.title")}</h2>
        <p className="lead">{t("guess.intro", { name: partnerName })}</p>
        <button type="button" className="button" disabled={busy} onClick={() => call("start_guess_game", { target: roomId })}>{t("guess.start")}</button>
        {error && <p role="alert" className="error">{error}</p>}
      </section>
    );
  }

  return (
    <div className="guess">
      {state.finished && (
        <section className="sheet guess-score" aria-live="polite">
          <h2>{t("guess.result")}</h2>
          <p className="score-line">
            <span>{t("guess.myScore")}</span> <strong>{state.score.me}</strong>
            <span>{t("guess.partnerScore", { name: partnerName })}</span> <strong>{state.score.partner}</strong>
          </p>
          <button type="button" className="button" disabled={busy} onClick={() => call("start_guess_game", { target: roomId })}>{t("guess.new")}</button>
        </section>
      )}
      <ol className="guess-rounds">
        {state.rounds.map((r) => (
          <Round key={state.game + ":" + r.round} game={state.game} round={r} busy={busy} onAnswer={call} partnerName={partnerName} />
        ))}
      </ol>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

function Round({ game, round, busy, onAnswer, partnerName }: {
  game: string; round: GuessRound; busy: boolean; partnerName: string;
  onAnswer: (fn: string, args: Record<string, unknown>) => Promise<void>;
}) {
  const { t, locale } = useT();
  const item = (locale === "en" ? guessQuestionsEn : guessQuestions)[round.question];
  const [own, setOwn] = useState<number | null>(null);
  const [guess, setGuess] = useState<number | null>(null);
  if (!item) return null;
  const name = (i: number) => item.options[i];

  return (
    <li className="sheet guess-round" data-round={round.round}>
      <p className="round-no">{t("guess.roundNo", { n: round.round })}</p>
      <h3>{item.q}</h3>
      {round.mine ? (
        <div className="round-result">
          <p>{t("guess.mine")} <strong>{name(round.mine.own)}</strong></p>
          <p>{t("guess.myGuess")} <strong>{name(round.mine.guess)}</strong></p>
          {round.partner ? (
            <>
              <p>{t("guess.theirs", { name: partnerName })} <strong>{name(round.partner.own)}</strong></p>
              <p className={round.mine.guess === round.partner.own ? "hit" : "miss"}>
                {round.mine.guess === round.partner.own ? t("guess.hit") : t("guess.miss")}
              </p>
              <p className="hint">{t("guess.theyGuessed", { name: partnerName, pick: name(round.partner.guess) })}</p>
            </>
          ) : (
            <p className="waiting">{t("guess.waiting", { name: partnerName })}</p>
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
          {round.partnerAnswered && <p className="hint">{t("guess.partnerAnswered", { name: partnerName })}</p>}
          <fieldset>
            <legend>{t("guess.mine")}</legend>
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
            <legend>{t("guess.whatTheyPicked", { name: partnerName })}</legend>
            <div className="choice-grid">
              {item.options.map((o, i) => (
                <label key={o} className="choice">
                  <input type="radio" name={"guess-" + round.round} value={i} checked={guess === i} onChange={() => setGuess(i)} />
                  <span>{o}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" className="button" disabled={busy || own === null || guess === null}>{t("guess.submit")}</button>
        </form>
      )}
    </li>
  );
}
