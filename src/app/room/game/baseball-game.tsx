"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserClient } from "../../../lib/supabase/browser";
import { useT } from "../../../i18n/client";
import { DIGITS, MAX_GUESSES, type BaseballGuess, type BaseballState, type Memo, isBaseballNumber, nextMemo, typeDigit } from "../../../core/baseball";
import { useRoomChannel } from "../use-room-channel";
import { useNewGameRefresh } from "./new-game";
import { GameResult } from "./game-result";

// Three slots that fill as digits are typed.
function Slots({ value, label }: { value: string; label: string }) {
  return (
    <div className="bb-slots" role="img" aria-label={label + ": " + (value.split("").join(" ") || "-")}>
      {Array.from({ length: DIGITS }, (_, i) => (
        <span key={i} className="bb-ball" data-filled={value[i] !== undefined} data-next={i === value.length}>{value[i] ?? ""}</span>
      ))}
    </div>
  );
}

function Result({ g }: { g: Pick<BaseballGuess, "s" | "b"> | null }) {
  if (!g) return <span className="bb-pill" data-kind="wait" aria-label="…">…</span>;
  if (g.s === 0 && g.b === 0) return <span className="bb-pill" data-kind="out">OUT</span>;
  return (
    <span className="bb-pill" data-kind={g.s === DIGITS ? "hit" : "count"}>
      {g.s > 0 && <b data-k="s">{g.s}S</b>}
      {g.b > 0 && <b data-k="b">{g.b}B</b>}
    </span>
  );
}

function Board({ title, rows, pending, fresh, testId }: { title: string; rows: BaseballGuess[]; pending?: string | null; fresh: number; testId: string }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows.length, pending]);
  return (
    <section className="bb-board" aria-label={title} data-testid={testId}>
      <h3>{title} <small>{rows.length}/{MAX_GUESSES}</small></h3>
      <ol ref={list}>
        {rows.map((r, i) => (
          <li key={i} className={i >= fresh ? "is-new" : undefined}>
            <span className="bb-n">{i + 1}</span>
            <span className="bb-digits">{r.guess.split("").map((d, j) => <i key={j}>{d}</i>)}</span>
            <Result g={r} />
          </li>
        ))}
        {pending && (
          <li className="is-new is-pending">
            <span className="bb-n">{rows.length + 1}</span>
            <span className="bb-digits">{pending.split("").map((d, j) => <i key={j}>{d}</i>)}</span>
            <Result g={null} />
          </li>
        )}
        {rows.length === 0 && !pending && <li className="bb-empty">—</li>}
      </ol>
    </section>
  );
}

export function BaseballGame({ roomId, initial, partnerName, myName }: { roomId: string; initial: BaseballState | null; partnerName: string; myName: string }) {
  const { t } = useT();
  const [state, setState] = useState(initial);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [memo, setMemo] = useState<Memo[]>(() => Array(10).fill(""));
  const [showSecret, setShowSecret] = useState(true);
  const roomChannel = useRoomChannel(roomId);
  // Rows already on screen when the page opened do not animate; later ones slide in.
  const fresh = useRef<{ game: number; mine: number; theirs: number } | null>(null);

  const receive = useCallback((next: BaseballState) => setState((old) => (old && old.revision > next.revision ? old : next)), []);
  const refresh = useCallback(async () => {
    try {
      const r = await browserClient()?.rpc("baseball_state", { target: roomId });
      if (!r || r.error) throw r?.error;
      receive(r.data);
      setError(false);
    } catch {
      setError(true);
    }
  }, [roomId, receive]);
  useNewGameRefresh(refresh);
  useEffect(() => {
    const c = browserClient();
    if (!c) return;
    let live = true;
    let channel: ReturnType<typeof c.channel> | undefined;
    void c.realtime
      .setAuth()
      .then(() => {
        if (!live) return;
        channel = roomChannel(c)
          .on("broadcast", { event: "baseball" }, () => void refresh())
          .subscribe((s) => {
            if (s === "SUBSCRIBED") void refresh();
          });
      })
      .catch(() => setError(true));
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    window.addEventListener("focus", refresh);
    void refresh();
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      if (channel) void c.removeChannel(channel);
    };
  }, [roomChannel, refresh]);

  const g = state && state.phase !== "idle" ? state : null;
  const game = g?.game ?? 0;
  // A new game clears the typed number and the memo pad.
  useEffect(() => {
    setTyped("");
    setPending(null);
    setMemo(Array(10).fill(""));
  }, [game]);

  const mine = g ? g.guesses.filter((x) => x.seat === g.mySeat) : [];
  const theirs = g ? g.guesses.filter((x) => x.seat !== g.mySeat) : [];
  if (g && (!fresh.current || fresh.current.game !== g.game)) fresh.current = { game: g.game, mine: fresh.current ? 0 : mine.length, theirs: fresh.current ? 0 : theirs.length };

  const choosing = g?.phase === "setup" && !g.mySecret;
  const myTurn = g?.phase === "playing" && g.turnSeat === g.mySeat;
  const repeat = g?.phase === "playing" && mine.some((x) => x.guess === typed);
  const canSend = !busy && !pending && isBaseballNumber(typed) && (choosing || (myTurn && !repeat));

  const send = useCallback(async () => {
    if (!g || !canSend) return;
    const action = choosing ? "secret" : "guess";
    const digits = typed;
    setBusy(true);
    setError(false);
    if (action === "guess") setPending(digits); // show the throw right away
    setTyped("");
    try {
      const r = await browserClient()?.rpc("baseball_action", { target: roomId, expected_revision: g.revision, action, digits });
      if (!r || r.error) throw r?.error;
      receive(r.data);
    } catch {
      setError(true);
      setTyped(digits);
      void refresh();
    } finally {
      setPending(null);
      setBusy(false);
    }
  }, [g, canSend, choosing, typed, roomId, receive, refresh]);

  // Keyboard: digits type, Backspace erases, Enter throws.
  const typing = choosing || g?.phase === "playing";
  useEffect(() => {
    if (!typing) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (el && el.closest("input, textarea, select, [contenteditable=true]"))) return;
      if (/^[0-9]$/.test(e.key)) setTyped((v) => typeDigit(v, e.key));
      else if (e.key === "Backspace") setTyped((v) => v.slice(0, -1));
      else if (e.key === "Enter" && el?.tagName !== "BUTTON") void send();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [typing, send]);

  const wins = state?.wins ?? [0, 0];
  const seat = state?.mySeat ?? 1;
  const result = g?.phase === "finished" ? (g.winner === 0 ? "tie" : g.winner === g.mySeat ? "win" : "loss") : null;

  const keypad = (
    <div className="bb-pad" aria-label={t("bb.keypad")}>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => (
        <button key={d} type="button" disabled={typed.includes(d) || typed.length >= DIGITS} onClick={() => setTyped((v) => typeDigit(v, d))} data-memo={g?.phase === "playing" ? memo[Number(d)] || undefined : undefined}>
          {d}
        </button>
      ))}
      <button type="button" className="bb-erase" disabled={!typed} onClick={() => setTyped((v) => v.slice(0, -1))} aria-label={t("bb.erase")}>⌫</button>
    </div>
  );

  return (
    <section className="bb-game" data-phase={state?.phase} data-turn={myTurn ? "me" : "partner"}>
      <header className="post-heading">
        <div>
          <h2>{t("game.baseball")}</h2>
          <p>{t("bb.subtitle")}</p>
        </div>
        <span className="room-mascot" aria-hidden="true" />
      </header>
      <p className="bb-record" data-testid="bb-record">
        {t("bb.record", { me: myName, a: String(wins[seat - 1]), name: partnerName, b: String(wins[2 - seat]), d: String(state?.draws ?? 0) })}
      </p>
      {error && (
        <p className="error" role="alert">
          {t("common.saveFailed")} <button onClick={refresh}>{t("post.retry")}</button>
        </p>
      )}

      {!g ? (
        <p className="notice">{t("bb.begin")}</p>
      ) : g.phase === "setup" ? (
        <div className="bb-setup">
          {choosing ? (
            <>
              <h3>{t("bb.pickTitle")}</h3>
              <p className="hint">{t("bb.pickHint")}</p>
              <Slots value={typed} label={t("bb.mySecret")} />
              {keypad}
              <button className="button bb-go" disabled={!canSend} onClick={send}>{t("bb.lock")}</button>
            </>
          ) : (
            <>
              <h3>{t("bb.locked")}</h3>
              <Slots value={g.mySecret ?? ""} label={t("bb.mySecret")} />
              <p className="post-turn bb-wait" role="status">{t("bb.waitPick", { name: partnerName })}<span className="bb-dots" aria-hidden="true"><i /><i /><i /></span></p>
            </>
          )}
          {choosing && <p className="hint" data-testid="bb-partner-pick">{t(g.partnerReady ? "bb.partnerReady" : "bb.partnerPicking", { name: partnerName })}</p>}
        </div>
      ) : (
        <>
          <div className="bb-status" role="status" data-testid="bb-status">
            {g.phase === "finished"
              ? null
              : g.lastChance
                ? t(myTurn ? "bb.lastChanceMe" : "bb.lastChanceThem", { name: partnerName })
                : t(myTurn ? "bb.yourTurn" : "bb.theirTurn", { name: partnerName })}
          </div>
          {result && <GameResult result={result} partnerName={partnerName} myName={myName} />}
          <div className="bb-secrets">
            <span>
              {t("bb.mySecret")}{" "}
              <button type="button" className="bb-peek" onClick={() => setShowSecret((v) => !v)} aria-pressed={showSecret} data-testid="bb-my-secret">
                {showSecret ? g.mySecret?.split("").join(" ") : "• • •"}
              </button>
            </span>
            {g.partnerSecret && (
              <span data-testid="bb-partner-secret">{t("bb.theirSecret", { name: partnerName })} <b>{g.partnerSecret.split("").join(" ")}</b></span>
            )}
          </div>
          <div className="bb-boards">
            <Board title={t("bb.myGuesses")} rows={mine} pending={pending} fresh={fresh.current?.mine ?? 0} testId="bb-mine" />
            <Board title={t("bb.theirGuesses", { name: partnerName })} rows={theirs} fresh={fresh.current?.theirs ?? 0} testId="bb-theirs" />
          </div>
          {g.phase === "playing" && (
            <div className="bb-throw" data-active={myTurn}>
              <Slots value={typed} label={t("bb.myGuess")} />
              {keypad}
              <button className="button bb-go" disabled={!canSend} onClick={send}>{t("bb.throw")}</button>
              <p className="hint">{repeat ? t("bb.repeat") : myTurn ? t("bb.keys") : t("bb.preType")}</p>
              <div className="bb-memo" aria-label={t("bb.memo")}>
                <span>{t("bb.memo")}</span>
                {memo.map((m, d) => (
                  <button key={d} type="button" data-memo={m || undefined} aria-label={`${d} ${m === "out" ? "✗" : m === "in" ? "○" : ""}`} onClick={() => setMemo((all) => all.map((x, i) => (i === d ? nextMemo(x) : x)))}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <details className="poker-rules">
        <summary>{t("bb.rulesTitle")}</summary>
        <p>{t("bb.rules")}</p>
      </details>
    </section>
  );
}
