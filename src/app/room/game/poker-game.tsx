"use client";
import { useCallback, useEffect, useState } from "react";
import { browserClient } from "../../../lib/supabase/browser";
import { useT } from "../../../i18n/client";
import { cardLabel, type PokerState } from "../../../core/poker";
import { useRoomChannel } from "../use-room-channel";
import { useNewGameRefresh } from "./new-game";
import { GameResult } from "./game-result";
function Card({ card }: { card?: number }) {
  return (
    <span
      className="poker-card"
      data-red={card !== undefined && [1, 2].includes(Math.floor(card / 13))}
      data-hidden={card === undefined}
      aria-label={card === undefined ? "Hidden card" : cardLabel(card)}
    >
      {card === undefined ? "♥" : cardLabel(card)}
    </span>
  );
}
export function PokerGame({
  roomId,
  initial,
  partnerName,
  myName,
}: {
  roomId: string;
  initial: PokerState | null;
  partnerName: string;
  myName: string;
}) {
  const { t } = useT();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [amount, setAmount] = useState(4);
  const roomChannel = useRoomChannel(roomId);
  const receive = useCallback(
    (next: PokerState) =>
      setState((old) => (old && old.revision > next.revision ? old : next)),
    [],
  );
  const refresh = useCallback(async () => {
    try {
      const r = await browserClient()?.rpc("poker_state", { target: roomId });
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
          .on("broadcast", { event: "poker" }, () => void refresh())
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
  const g = state?.phase !== "idle" ? state : null;
  useEffect(() => {
    if (g) setAmount(Math.min(g.minRaiseTo, g.maxRaiseTo));
  }, [g?.revision]);
  async function act(action: string, raiseTo?: number) {
    if (!state || busy) return;
    setBusy(true);
    setError(false);
    try {
      const r = await browserClient()?.rpc("poker_action", {
        target: roomId,
        expected_revision: state.revision,
        action,
        raise_to: raiseTo ?? null,
      });
      if (!r || r.error) throw r?.error;
      receive(r.data);
    } catch {
      setError(true);
      void refresh();
    } finally {
      setBusy(false);
    }
  }
  const myTurn = g?.phase === "playing" && g.turnSeat === g.mySeat;
  return (
    <section
      className="poker-game"
      data-phase={state?.phase}
      data-turn={myTurn ? "me" : "partner"}
    >
      <header className="post-heading">
        <div>
          <h2>{t("game.poker")}</h2>
          <p>{t("poker.subtitle")}</p>
        </div>
        <span className="room-mascot" aria-hidden="true" />
      </header>
      {error && (
        <p className="error" role="alert">
          {t("common.saveFailed")}{" "}
          <button onClick={refresh}>{t("post.retry")}</button>
        </p>
      )}
      {!g ? (
        <p className="notice">{t("poker.begin")}</p>
      ) : (
        <>
          <div className="poker-meta">
            <span>{t("poker.hand", { n: g.hand })}</span>
            <span>SB 1 / BB 2 · {g.stackBB} BB</span>
          </div>
          <div className="poker-table">
            <div className="poker-seat">
              <b>
                {partnerName} {g.dealer !== g.mySeat ? "ⓓ" : ""}
              </b>
              <span>
                {g.stacks[2 - g.mySeat]} {t("poker.chips")}
              </span>
              <div className="poker-cards">
                {[0, 1].map((i) => (
                  <Card key={i} card={g.opponentCards?.[i]} />
                ))}
              </div>
              <small>{t("poker.bet", { n: g.bets[2 - g.mySeat] })}</small>
            </div>
            <div className="poker-community">
              <strong>
                {t("poker.pot", {
                  n: g.phase === "playing" ? g.pot : g.lastPot,
                })}
              </strong>
              <div className="poker-cards">
                {Array.from({ length: 5 }, (_, i) => (
                  <Card key={i} card={g.board[i]} />
                ))}
              </div>
              <span>
                {t(
                  (
                    [
                      "poker.preflop",
                      "poker.flop",
                      "poker.turn",
                      "poker.river",
                    ] as const
                  )[g.street],
                )}
              </span>
            </div>
            <div className="poker-seat">
              <b>
                {myName} {g.dealer === g.mySeat ? "ⓓ" : ""}
              </b>
              <span>
                {g.stacks[g.mySeat - 1]} {t("poker.chips")}
              </span>
              <div className="poker-cards">
                {g.cards.map((card) => (
                  <Card key={card} card={card} />
                ))}
              </div>
              <small>{t("poker.bet", { n: g.bets[g.mySeat - 1] })}</small>
            </div>
          </div>
          {g.phase === "playing" ? (
            <>
              <p className="post-turn" role="status">
                {t(myTurn ? "poker.yourTurn" : "poker.wait", {
                  name: partnerName,
                })}
              </p>
              <div className="poker-actions">
                <button
                  className="button ghost"
                  disabled={!myTurn || busy}
                  onClick={() => act("fold")}
                >
                  {t("poker.fold")}
                </button>
                <button
                  className="button"
                  disabled={!myTurn || busy}
                  onClick={() => act(g.call ? "call" : "check")}
                >
                  {g.call ? t("poker.call", { n: g.call }) : t("poker.check")}
                </button>
                {g.canRaise && (
                  <>
                    <label>
                      {t("poker.raiseTo")}
                      <input
                        type="number"
                        inputMode="numeric"
                        min={Math.min(g.minRaiseTo, g.maxRaiseTo)}
                        max={g.maxRaiseTo}
                        step={1}
                        value={amount}
                        disabled={!myTurn || busy}
                        onChange={(e) => setAmount(Number(e.target.value))}
                      />
                    </label>
                    <button
                      className="button"
                      disabled={
                        !myTurn ||
                        busy ||
                        !Number.isInteger(amount) ||
                        amount > g.maxRaiseTo ||
                        (amount < g.minRaiseTo && amount !== g.maxRaiseTo)
                      }
                      onClick={() => act("raise", amount)}
                    >
                      {t("poker.raise")}
                    </button>
                    <button
                      className="button ghost"
                      disabled={!myTurn || busy}
                      onClick={() => act("raise", g.maxRaiseTo)}
                    >
                      {t("poker.allIn")}
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <GameResult
                result={
                  g.winner === 0
                    ? "tie"
                    : g.winner === g.mySeat
                      ? "win"
                      : "loss"
                }
                partnerName={partnerName}
                myName={myName}
                hand={g.phase === "showdown"}
              />
              {g.rank !== null && (
                <p className="hint">
                  {t(
                    (
                      [
                        "poker.rank0",
                        "poker.rank1",
                        "poker.rank2",
                        "poker.rank3",
                        "poker.rank4",
                        "poker.rank5",
                        "poker.rank6",
                        "poker.rank7",
                        "poker.rank8",
                      ] as const
                    )[g.rank],
                  )}
                </p>
              )}
              {g.phase === "showdown" && (
                <button
                  className="button"
                  disabled={busy || g.ready[g.mySeat - 1]}
                  onClick={() => act("next")}
                >
                  {t(g.ready[g.mySeat - 1] ? "poker.readyWait" : "poker.next")}
                </button>
              )}
            </>
          )}
        </>
      )}
      <details className="poker-rules">
        <summary>{t("poker.rulesTitle")}</summary>
        <p>{t("poker.rules")}</p>
        <p>{t("poker.duration")}</p>
        <a
          href="https://wsop.gg-global-cdn.com/wsop/pdfs/2026-WSOP-Tournament-Rules.pdf"
          target="_blank"
          rel="noreferrer"
        >
          WSOP 2026 · Rules 73, 87, 96
        </a>
      </details>
    </section>
  );
}
