"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "../../../lib/supabase/browser";
import { roomErrorKey } from "../../../core/auth-paths";
import { useT } from "../../../i18n/client";
import { cellLabel, GOMOKU_SIZE, scoreLine, stoneOf, type GomokuState } from "../../../core/gomoku";

// 오목. The database decides turns and the winner; this screen shows the board, previews a tap, and sends the stone.
export function GomokuGame({ roomId, initial, partnerName }: { roomId: string; initial: GomokuState; partnerName: string }) {
  const { t } = useT();
  const [state, setState] = useState<GomokuState>(initial);
  const [pick, setPick] = useState<{ x: number; y: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const supabaseRef = useRef<ReturnType<typeof browserClient>>(null);

  const refresh = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const { data } = await supabase.rpc("gomoku_state", { target: roomId });
    if (data) setState(data as GomokuState);
  }, [roomId]);

  useEffect(() => {
    const supabase = browserClient();
    supabaseRef.current = supabase;
    if (!supabase) return;
    let active = true;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    const reread = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => refresh(), 80);
    };
    (async () => {
      await supabase.realtime.setAuth();
      if (!active) return;
      channel = supabase
        .channel("room:" + roomId, { config: { private: true } })
        .on("broadcast", { event: "gomoku" }, reread)
        .on("broadcast", { event: "members" }, () => window.location.reload())
        .subscribe((status) => {
          document.documentElement.dataset.roomLive = status === "SUBSCRIBED" ? "on" : "off";
          if (status === "SUBSCRIBED") reread();
        });
    })();
    const beat = setInterval(() => refresh(), 20_000);
    return () => {
      active = false;
      clearTimeout(debounce);
      clearInterval(beat);
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId, refresh]);

  const stones = useMemo(() => {
    const map = new Map<string, { color: "black" | "white"; n: number }>();
    if (state.game) for (const m of state.moves) map.set(`${m.x},${m.y}`, { color: stoneOf(m.by, state.me), n: m.n });
    return map;
  }, [state]);
  const winCells = useMemo(() => new Set(state.game && state.winLine ? state.winLine.map(([x, y]) => `${x},${y}`) : []), [state]);

  const open = state.game !== null && state.status === "open";
  const myTurn = open && state.turn === "me";
  const lastN = state.game ? state.moves.length : 0;

  async function start() {
    const supabase = supabaseRef.current;
    if (!supabase || busy) return;
    setBusy(true);
    const { error: failure } = await supabase.rpc("start_gomoku", { target: roomId });
    setBusy(false);
    setError(failure ? t(roomErrorKey(failure.message)) : "");
    setPick(null);
    setSure(false);
    await refresh();
  }

  async function place() {
    const supabase = supabaseRef.current;
    if (!supabase || busy || !pick || !state.game) return;
    setBusy(true);
    const { error: failure } = await supabase.rpc("play_gomoku", { game: state.game, px: pick.x, py: pick.y, req: crypto.randomUUID() });
    setBusy(false);
    setError(failure ? t(roomErrorKey(failure.message)) : "");
    setPick(null);
    await refresh();
  }

  async function resign() {
    const supabase = supabaseRef.current;
    if (!supabase || busy || !state.game) return;
    setBusy(true);
    const { error: failure } = await supabase.rpc("resign_gomoku", { game: state.game });
    setBusy(false);
    setSure(false);
    setError(failure ? t(roomErrorKey(failure.message)) : "");
    await refresh();
  }

  const headline = !state.game
    ? t("gomoku.none")
    : state.status === "won"
      ? state.winner === "me" ? t("gomoku.won") : t("gomoku.lost")
      : state.status === "draw"
        ? t("gomoku.draw")
        : myTurn ? t("gomoku.myTurn", { color: state.me === "black" ? t("gomoku.black") : t("gomoku.white") }) : t("gomoku.theirTurn", { name: partnerName });

  return (
    <div className="gomoku" data-status={state.game ? state.status : "none"} data-turn={state.game ? (state.turn ?? "") : ""}>
      <section className="sheet">
        <h2>{t("gomoku.title")}</h2>
        <p className="waiting" role="status" aria-live="polite">{headline}</p>
        <p className="hint">{scoreLine(state, t, partnerName)}</p>
        {state.game && state.status === "open" && <p className="hint">{t("gomoku.rules")}</p>}
      </section>

      {state.game && (
        <section className="gomoku-wrap" aria-label={t("gomoku.board")}>
          <div className="gomoku-board" data-my-turn={myTurn}>
            {Array.from({ length: GOMOKU_SIZE * GOMOKU_SIZE }, (_, i) => {
              const x = i % GOMOKU_SIZE;
              const y = Math.floor(i / GOMOKU_SIZE);
              const key = `${x},${y}`;
              const stone = stones.get(key);
              const previewed = pick?.x === x && pick?.y === y;
              const label = cellLabel(x, y, t) + (stone ? (stone.color === "black" ? t("gomoku.cellBlack") : t("gomoku.cellWhite")) : previewed ? t("gomoku.cellPreview") : t("gomoku.cellEmpty"));
              return (
                <button
                  key={key}
                  type="button"
                  className="cell"
                  data-x={x}
                  data-y={y}
                  data-stone={stone?.color}
                  data-last={stone?.n === lastN ? "true" : undefined}
                  data-win={winCells.has(key) ? "true" : undefined}
                  data-preview={previewed ? state.me : undefined}
                  aria-label={label}
                  disabled={!myTurn || Boolean(stone) || busy}
                  onClick={() => setPick({ x, y })}
                />
              );
            })}
          </div>
        </section>
      )}

      <section className="sheet">
        {open && (
          <div className="draw-actions">
            <button type="button" className="button" disabled={!myTurn || !pick || busy} onClick={place}>{t("gomoku.place")}</button>
            {pick && <span className="hint">{cellLabel(pick.x, pick.y, t)}</span>}
          </div>
        )}
        {open && !sure && <button type="button" className="link" onClick={() => setSure(true)}>{t("gomoku.resign")}</button>}
        {open && sure && (
          <div className="draw-actions">
            <span>{t("gomoku.resignSure", { name: partnerName })}</span>
            <button type="button" className="button ghost" onClick={resign} disabled={busy}>{t("gomoku.resignYes")}</button>
            <button type="button" className="link" onClick={() => setSure(false)}>{t("gomoku.keepPlaying")}</button>
          </div>
        )}
        {!open && (
          <button type="button" className="button" disabled={busy} onClick={start}>{state.game ? t("gomoku.rematch") : t("guess.start")}</button>
        )}
        {error && <p role="alert" className="error">{error}</p>}
      </section>
    </div>
  );
}
