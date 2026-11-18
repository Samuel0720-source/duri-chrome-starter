"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { browserClient } from "../../../lib/supabase/browser";
import { roomErrorKey } from "../../../core/auth-paths";
import { useT } from "../../../i18n/client";
import {
  applyMove, capturedSummary, chessScoreLine, findKing, legalMovesForSquare, pieceColor, sqCol, sqIndex, sqName, sqRow,
  type ChessColor, type ChessPosition, type ChessState, type PromoPiece,
} from "../../../core/chess";
import { useRoomChannel } from "../use-room-channel";
import { GameResult } from "./game-result";
import { useNewGameRefresh } from "./new-game";

function playTone(kind: "move" | "capture" | "check" | "end") {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    if (kind === "move") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.06);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.start(now);
      osc.stop(now + 0.075);
    } else if (kind === "capture") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.09);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (kind === "check") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(390, now + 0.14);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.16);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554, now + 0.09);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.26);
    }
    setTimeout(() => void ctx.close(), 350);
  } catch {
    // AudioContext blocked or unsupported
  }
}

// Crisp Staunton-style SVG chess pieces (identical across macOS, Windows, iOS, and Android).
function ChessPieceSvg({ piece, className }: { piece: string; className?: string }) {
  const isWhite = piece >= "A" && piece <= "Z";
  const type = piece.toLowerCase();
  const fill = isWhite ? "#fffdf9" : "#2b2226";
  const stroke = isWhite ? "#2b2226" : "#181316";
  const detail = isWhite ? "#2b2226" : "#e7dce0";
  const sw = "2";

  return (
    <svg viewBox="0 0 45 45" className={className ?? "chess-piece-svg"} aria-hidden="true">
      {type === "p" && (
        <path
          d="M22.5 9a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4zm-5.2 18c0-2.6 2.1-5.8 5.2-7 3.1 1.2 5.2 4.4 5.2 7 0 2-1.4 3.5-2.7 4.4 2.4 1.3 4.5 3.6 4.5 6.6H15.5c0-3 2.1-5.3 4.5-6.6-1.3-.9-2.7-2.4-2.7-4.4z"
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {type === "r" && (
        <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 39h27v-3H9v3zm3-3v-4h21v4H12zm-1-22V9h4v2h5V9h5v2h5V9h4v5" />
          <path d="M34 14l-3 3H14l-3-3" />
          <path d="M31 17v12.5H14V17" />
          <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
          <path d="M14 17h17" stroke={detail} strokeWidth="1.5" />
        </g>
      )}
      {type === "n" && (
        <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
          <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" />
          <circle cx="15" cy="15.5" r="1.2" fill={detail} stroke="none" />
          <path d="M12 39h24" />
        </g>
      )}
      {type === "b" && (
        <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z" />
          <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
          <circle cx="22.5" cy="8" r="2.5" />
          <path d="M17.5 26h10M19.5 18h6M22.5 15v6" fill="none" stroke={detail} strokeWidth="1.6" />
        </g>
      )}
      {type === "q" && (
        <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="12" r="2.3" />
          <circle cx="14" cy="9" r="2.3" />
          <circle cx="22.5" cy="8" r="2.3" />
          <circle cx="31" cy="9" r="2.3" />
          <circle cx="39" cy="12" r="2.3" />
          <path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z" />
          <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
          <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" stroke={detail} strokeWidth="1.5" />
        </g>
      )}
      {type === "k" && (
        <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M22.5 11.63V6M20 8h5" fill="none" />
          <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" />
          <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" />
          <path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0" fill="none" stroke={detail} strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
}

export function ChessGame({ roomId, initial, partnerName }: { roomId: string; initial: ChessState; partnerName: string }) {
  const { t } = useT();
  const router = useRouter();
  const roomChannel = useRoomChannel(roomId);
  const [state, setState] = useState<ChessState>(initial);
  const [selected, setSelected] = useState<number | null>(null);
  const [promoMove, setPromoMove] = useState<{ from: number; to: number } | null>(null);
  const [drag, setDrag] = useState<{ from: number; piece: string; x: number; y: number; active: boolean } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [error, setError] = useState("");
  const supabaseRef = useRef<ReturnType<typeof browserClient>>(null);
  const prevMoveCountRef = useRef<number>(initial.game ? initial.moves.length : 0);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  const refresh = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const { data } = await supabase.rpc("chess_state", { target: roomId });
    if (!data) return;
    const next = data as ChessState;
    if (next.game) {
      const prevN = prevMoveCountRef.current;
      const nextN = next.moves.length;
      if (nextN > prevN && soundRef.current) {
        if (next.status !== "open") playTone("end");
        else if (next.inCheck) playTone("check");
        else if (next.moves[nextN - 1]?.notation.includes("x")) playTone("capture");
        else playTone("move");
      }
      prevMoveCountRef.current = nextN;
    } else {
      prevMoveCountRef.current = 0;
    }
    setState(next);
  }, [roomId]);

  useNewGameRefresh(refresh);

  useEffect(() => {
    const supabase = browserClient();
    supabaseRef.current = supabase;
    if (!supabase) return;
    let active = true;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    const reread = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void refresh(), 70);
    };
    (async () => {
      await supabase.realtime.setAuth();
      if (!active) return;
      channel = roomChannel(supabase)
        .on("broadcast", { event: "chess" }, reread)
        .on("broadcast", { event: "members" }, () => router.refresh())
        .subscribe((status) => {
          document.documentElement.dataset.roomLive = status === "SUBSCRIBED" ? "on" : "off";
          if (status === "SUBSCRIBED") reread();
        });
    })();
    const beat = setInterval(() => void refresh(), 20_000);
    return () => {
      active = false;
      clearTimeout(debounce);
      clearInterval(beat);
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomChannel, roomId, refresh, router]);

  const s = state.game ? state : null;
  const open = Boolean(s && s.status === "open");
  const myColor: ChessColor = s?.me === "black" ? "b" : "w";
  const myTurn = Boolean(s && open && s.turn === "me");

  const pos: ChessPosition | null = useMemo(() => {
    if (!s) return null;
    return {
      board: s.board,
      turn: s.turn === "me" ? myColor : (myColor === "w" ? "b" : "w"),
      castling: s.castling,
      ep: s.ep,
      halfmove: s.halfmove,
    };
  }, [s, myColor]);

  const legalTargets = useMemo(() => {
    const map = new Map<number, { promo: boolean }>();
    if (!pos || selected === null || !myTurn) return map;
    for (const m of legalMovesForSquare(pos, selected)) {
      map.set(m.to, { promo: Boolean(m.promo) });
    }
    return map;
  }, [pos, selected, myTurn]);

  const checkedKingSq = useMemo(() => {
    if (!s || !pos || !s.inCheck) return -1;
    return findKing(s.board, pos.turn);
  }, [s, pos]);

  const summary = useMemo(() => (s ? capturedSummary(s.board) : null), [s]);

  const movePairs = useMemo(() => {
    if (!s) return [];
    const pairs: { n: number; w?: string; b?: string }[] = [];
    for (let i = 0; i < s.moves.length; i += 2) {
      pairs.push({ n: i / 2 + 1, w: s.moves[i]?.notation, b: s.moves[i + 1]?.notation });
    }
    return pairs;
  }, [s]);

  async function start() {
    const supabase = supabaseRef.current;
    if (!supabase || busy) return;
    setBusy(true);
    const { error: failure } = await supabase.rpc("start_chess", { target: roomId });
    setBusy(false);
    setSelected(null);
    setPromoMove(null);
    setSure(false);
    setError(failure ? t(roomErrorKey(failure.message)) : "");
    await refresh();
  }

  async function commitMove(from: number, to: number, promo?: PromoPiece) {
    const supabase = supabaseRef.current;
    if (!supabase || !s || !pos || busy) return;
    const prevSnapshot = s;
    const sim = applyMove(pos, from, to, promo);
    if (!sim) return;

    setSelected(null);
    setPromoMove(null);
    setError("");
    if (soundRef.current) {
      if (sim.status !== "open") playTone("end");
      else if (sim.isCheck) playTone("check");
      else if (sim.notation.includes("x")) playTone("capture");
      else playTone("move");
    }
    prevMoveCountRef.current = s.moves.length + 1;
    // Optimistically reflect the move right away for snappy gameplay.
    setState({
      ...s,
      board: sim.next.board,
      castling: sim.next.castling,
      ep: sim.next.ep,
      halfmove: sim.next.halfmove,
      inCheck: sim.isCheck,
      lastMove: { from, to },
      status: sim.status,
      drawReason: sim.drawReason,
      turn: sim.status === "open" ? "partner" : null,
      winner: sim.status === "won" ? "me" : null,
      moves: [
        ...s.moves,
        { n: s.moves.length + 1, from, to, promo: promo ?? null, notation: sim.notation, boardAfter: sim.next.board },
      ],
    });

    setBusy(true);
    const { error: failure } = await supabase.rpc("play_chess", {
      game: s.game,
      from_sq: from,
      to_sq: to,
      promo: promo ?? null,
      req: crypto.randomUUID(),
    });
    setBusy(false);
    if (failure) {
      setState(prevSnapshot);
      prevMoveCountRef.current = prevSnapshot.moves.length;
      setError(t(roomErrorKey(failure.message)));
    }
    await refresh();
  }

  function trySelectOrMove(sq: number) {
    if (!s || !pos || !myTurn || busy) return;
    const targetInfo = legalTargets.get(sq);
    if (selected !== null && targetInfo) {
      if (targetInfo.promo) {
        setPromoMove({ from: selected, to: sq });
      } else {
        void commitMove(selected, sq);
      }
      return;
    }
    const piece = s.board[sq];
    if (piece !== "." && pieceColor(piece) === myColor) {
      setSelected(selected === sq ? null : sq);
      setPromoMove(null);
    } else {
      setSelected(null);
      setPromoMove(null);
    }
  }

  async function resign() {
    const supabase = supabaseRef.current;
    if (!supabase || !s || busy) return;
    setBusy(true);
    const { error: failure } = await supabase.rpc("resign_chess", { game: s.game });
    setBusy(false);
    setSure(false);
    setError(failure ? t(roomErrorKey(failure.message)) : "");
    await refresh();
  }

  // Pointer drag support (only triggers drag mode after moving >= 8px so simple taps remain instant)
  function onSquarePointerDown(sq: number, e: React.PointerEvent<HTMLButtonElement>) {
    if (!s || !myTurn || busy || promoMove) return;
    const piece = s.board[sq];
    if (piece === "." || pieceColor(piece) !== myColor) return;
    setDrag({ from: sq, piece, x: e.clientX, y: e.clientY, active: false });
  }

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      setDrag((prev) => {
        if (!prev) return null;
        const dist = Math.hypot(e.clientX - prev.x, e.clientY - prev.y);
        if (!prev.active && dist < 8) return prev;
        if (!prev.active) setSelected(prev.from);
        return { ...prev, x: e.clientX, y: e.clientY, active: true };
      });
    };
    const onUp = (e: PointerEvent) => {
      setDrag((prev) => {
        if (!prev) return null;
        if (prev.active) {
          const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-sq]");
          const targetSq = el ? Number(el.dataset.sq) : NaN;
          if (Number.isInteger(targetSq) && pos) {
            const match = legalMovesForSquare(pos, prev.from).find((m) => m.to === targetSq);
            if (match) {
              if (match.promo) setPromoMove({ from: prev.from, to: targetSq });
              else void commitMove(prev.from, targetSq);
            }
          }
        }
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(drag), pos]);

  const colorWord = s ? (s.me === "white" ? t("chess.white") : t("chess.black")) : "";
  const headline = !s
    ? t("chess.none")
    : s.status === "won"
      ? s.winner === "me" ? t("chess.won") : t("chess.lost")
      : s.status === "draw"
        ? t(`chess.draw.${s.drawReason ?? "stalemate"}` as "chess.draw.stalemate")
        : myTurn
          ? (s.inCheck ? t("chess.myTurnCheck", { color: colorWord }) : t("chess.myTurn", { color: colorWord }))
          : (s.inCheck ? t("chess.theirTurnCheck", { name: partnerName }) : t("chess.theirTurn", { name: partnerName }));

  const squares = useMemo(() => {
    const out: number[] = [];
    const flipped = s?.me === "black";
    for (let vr = 0; vr < 8; vr++) {
      for (let vc = 0; vc < 8; vc++) {
        const r = flipped ? 7 - vr : vr;
        const c = flipped ? 7 - vc : vc;
        out.push(sqIndex(r, c));
      }
    }
    return out;
  }, [s?.me]);

  const myCaptured = s && summary ? (s.me === "white" ? summary.capturedByWhite : summary.capturedByBlack) : [];
  const partnerCaptured = s && summary ? (s.me === "white" ? summary.capturedByBlack : summary.capturedByWhite) : [];
  const myLead = s && summary ? (s.me === "white" ? summary.whiteLead : -summary.whiteLead) : 0;

  return (
    <div className="chess" data-status={s ? s.status : "none"} data-turn={s ? (s.turn ?? "") : ""}>
      <section className="sheet chess-head">
        <div className="chess-title-row">
          <h2>{t("chess.title")}</h2>
          <button
            type="button"
            className="chess-sound"
            aria-pressed={soundOn}
            onClick={() => setSoundOn((v) => !v)}
          >
            {soundOn ? t("chess.soundOn") : t("chess.soundOff")}
          </button>
        </div>
        {s && (s.status === "won" || s.status === "draw") && (
          <GameResult result={s.status === "draw" ? "tie" : s.winner === "me" ? "win" : "loss"} partnerName={partnerName} />
        )}
        <p className="waiting" role="status" aria-live="polite">{headline}</p>
        <p className="hint">{chessScoreLine(state, t, partnerName)}</p>
        {s && open && <p className="hint">{t("chess.rules")}</p>}
      </section>

      {s && (
        <section className="chess-stage" aria-label={t("chess.board")}>
          <div className="chess-player-bar" data-active={open && !myTurn}>
            <span className="chess-badge" data-color={s.me === "white" ? "black" : "white"} />
            <strong>{partnerName}</strong>
            <div className="chess-captured" aria-label={t("chess.captured")}>
              {partnerCaptured.map((p, idx) => <ChessPieceSvg key={idx} piece={p} className="chess-cap-svg" />)}
              {myLead < 0 && <span className="chess-lead">+{Math.abs(myLead)}</span>}
            </div>
          </div>

          <div className="chess-board-shell">
            <div className="chess-board" data-my-turn={myTurn}>
              {squares.map((sq, idx) => {
                const r = sqRow(sq);
                const c = sqCol(sq);
                const light = (r + c) % 2 === 0;
                const piece = s.board[sq];
                const isSelected = selected === sq;
                const targetInfo = legalTargets.get(sq);
                const isLast = s.lastMove ? s.lastMove.from === sq || s.lastMove.to === sq : false;
                const isCheck = sq === checkedKingSq;
                const isDraggingSource = drag?.active && drag.from === sq;
                const showRank = idx % 8 === 0;
                const showFile = idx >= 56;
                const name = sqName(sq);
                return (
                  <button
                    key={sq}
                    type="button"
                    data-sq={sq}
                    data-name={name}
                    data-shade={light ? "light" : "dark"}
                    data-selected={isSelected ? "true" : undefined}
                    data-last={isLast ? "true" : undefined}
                    data-check={isCheck ? "true" : undefined}
                    data-target={targetInfo ? (piece !== "." || (s.ep === sq && selected !== null && s.board[selected].toLowerCase() === "p") ? "capture" : "move") : undefined}
                    className="chess-sq"
                    aria-label={name + (piece !== "." ? ` ${piece}` : "")}
                    disabled={!myTurn && !open}
                    onPointerDown={(e) => onSquarePointerDown(sq, e)}
                    onClick={() => trySelectOrMove(sq)}
                  >
                    {showRank && <span className="chess-coord chess-rank" aria-hidden="true">{8 - r}</span>}
                    {showFile && <span className="chess-coord chess-file" aria-hidden="true">{"abcdefgh"[c]}</span>}
                    {piece !== "." && !isDraggingSource && <ChessPieceSvg piece={piece} />}
                  </button>
                );
              })}
            </div>

            {promoMove && (
              <div className="chess-promo" role="dialog" aria-label={t("chess.promote")}>
                <p>{t("chess.promote")}</p>
                <div className="chess-promo-choices">
                  {(["q", "r", "b", "n"] as const).map((p) => {
                    const ch = myColor === "w" ? p.toUpperCase() : p;
                    return (
                      <button
                        key={p}
                        type="button"
                        aria-label={t(`chess.piece.${p}` as "chess.piece.q")}
                        onClick={() => void commitMove(promoMove.from, promoMove.to, p)}
                      >
                        <ChessPieceSvg piece={ch} />
                      </button>
                    );
                  })}
                </div>
                <button type="button" className="link" onClick={() => setPromoMove(null)}>{t("gomoku.keepPlaying")}</button>
              </div>
            )}
          </div>

          <div className="chess-player-bar" data-active={open && myTurn}>
            <span className="chess-badge" data-color={s.me} />
            <strong>{t("common.me")}</strong>
            <div className="chess-captured" aria-label={t("chess.captured")}>
              {myCaptured.map((p, idx) => <ChessPieceSvg key={idx} piece={p} className="chess-cap-svg" />)}
              {myLead > 0 && <span className="chess-lead">+{myLead}</span>}
            </div>
          </div>

          {drag?.active && (
            <div className="chess-drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
              <ChessPieceSvg piece={drag.piece} />
            </div>
          )}
        </section>
      )}

      {s && movePairs.length > 0 && (
        <section className="sheet chess-moves" aria-label={t("chess.moves")}>
          <h3>{t("chess.moves")}</h3>
          <ol className="chess-move-list">
            {movePairs.map((pair) => (
              <li key={pair.n}>
                <span className="chess-move-num">{pair.n}.</span>
                <span>{pair.w ?? ""}</span>
                <span>{pair.b ?? ""}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="sheet">
        {open && !sure && <button type="button" className="link" onClick={() => setSure(true)}>{t("gomoku.resign")}</button>}
        {open && sure && (
          <div className="draw-actions">
            <span>{t("gomoku.resignSure", { name: partnerName })}</span>
            <button type="button" className="button ghost" onClick={resign} disabled={busy}>{t("gomoku.resignYes")}</button>
            <button type="button" className="link" onClick={() => setSure(false)}>{t("gomoku.keepPlaying")}</button>
          </div>
        )}
        {!open && (
          <button type="button" className="button" disabled={busy} onClick={start}>{s ? t("chess.rematch") : t("guess.start")}</button>
        )}
        {error && <p role="alert" className="error">{error}</p>}
      </section>
    </div>
  );
}
