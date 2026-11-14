"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserClient } from "../../../lib/supabase/browser";
import { roomErrorKey } from "../../../core/auth-paths";
import { Rich, useT } from "../../../i18n/client";
import {
  BOARD_H, BOARD_W, DRAW_SECONDS, clockOffset, categoryLabel, drawCategories, isValidSegment,
  penColors, penWidths, recordText, secondsLeft, strokesToPaths, timeShare, wordIn,
  type DrawCategory, type DrawGuess, type DrawRecords, type DrawState, type Point, type Stroke,
} from "../../../core/draw";

type Pen = { id: string; color: string; width: number; points: Point[]; sent: number };

// "100초 그림 퀴즈": in 100 seconds, solve as many words as you can. What this screen may know comes only
// from draw_state() and the member-readable tables: the current word reaches the drawer only.
export function DrawGame({ roomId, initial, partnerName }: { roomId: string; initial: DrawState; partnerName: string }) {
  const { t, locale } = useT();
  const [state, setState] = useState<DrawState>(initial);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [guesses, setGuesses] = useState<DrawGuess[]>([]);
  const [category, setCategory] = useState<DrawCategory>("food");
  const [iDraw, setIDraw] = useState(true);
  const [color, setColor] = useState<string>(penColors[0]);
  const [width, setWidth] = useState<number>(10);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  const supabaseRef = useRef<ReturnType<typeof browserClient>>(null);
  const offsetRef = useRef(clockOffset(initial.nowMs, Date.now()));
  const gameRef = useRef<string | null>(initial.game);
  const wordNoRef = useRef<number>(initial.game ? initial.wordNo : 1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const penRef = useRef<Pen | null>(null);
  const pendingRef = useRef<Stroke[]>([]);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const flushTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const lastExpireRefresh = useRef(0);
  const strokesRef = useRef<Stroke[]>([]);

  const game = state.game ? state : null;
  const live = game?.phase === "live";
  const isDrawer = game?.role === "drawer";
  const left = game && game.deadlineMs ? secondsLeft(game.deadlineMs, Date.now(), offsetRef.current) : 0;

  // ---------------------------------------------------------------- reading from the server
  const refresh = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const { data } = await supabase.rpc("draw_state", { target: roomId });
    if (!data) return;
    const next = data as DrawState;
    offsetRef.current = clockOffset(next.nowMs, Date.now());
    gameRef.current = next.game;
    if (next.game) wordNoRef.current = next.wordNo;
    setState(next);
  }, [roomId]);

  const loadBoard = useCallback(async (id: string) => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const wordNo = wordNoRef.current;
    // Only the current word's drawing and answers: every word starts on a clean board.
    const [s, g] = await Promise.all([
      supabase.from("draw_strokes").select("seq, stroke, segment, color, width, points").eq("game_id", id).eq("word_no", wordNo).order("seq"),
      supabase.from("draw_guesses").select("id, player, guess, correct").eq("game_id", id).eq("word_no", wordNo).order("id"),
    ]);
    if (gameRef.current !== id || wordNoRef.current !== wordNo) return;
    if (s.data) setStrokes(s.data as Stroke[]);
    if (g.data) setGuesses(g.data as DrawGuess[]);
  }, []);

  useEffect(() => {
    const supabase = browserClient();
    supabaseRef.current = supabase;
    if (!supabase) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    // Signals come in bursts while someone draws; one re-read per 120 ms is enough.
    const reread = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        if (gameRef.current) loadBoard(gameRef.current);
      }, 120);
    };
    (async () => {
      await supabase.realtime.setAuth();
      if (!active) return;
      channel = supabase
        .channel("room:" + roomId, { config: { private: true } })
        .on("broadcast", { event: "draw" }, reread)
        .on("broadcast", { event: "members" }, () => window.location.reload())
        .subscribe((status) => {
          document.documentElement.dataset.roomLive = status === "SUBSCRIBED" ? "on" : "off";
          if (status === "SUBSCRIBED") reread();
        });
    })();
    reread();
    return () => {
      active = false;
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId, refresh, loadBoard]);

  const wordNo = state.game ? state.wordNo : 0;
  useEffect(() => {
    pendingRef.current = [];
    penRef.current = null;
    if (state.game) loadBoard(state.game);
    else {
      setStrokes([]);
      setGuesses([]);
      pendingRef.current = [];
    }
  }, [state.game, wordNo, loadBoard]);

  // Countdown: redraw the clock a few times a second; when it reaches 0 ask the server to end the round.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      setTick((n) => n + 1);
      const g = state.game ? state : null;
      if (g && g.deadlineMs && secondsLeft(g.deadlineMs, Date.now(), offsetRef.current) === 0 && Date.now() - lastExpireRefresh.current > 1200) {
        lastExpireRefresh.current = Date.now();
        refresh();
      }
    }, 200);
    return () => clearInterval(timer);
  }, [live, state, refresh]);

  // ---------------------------------------------------------------- the board
  strokesRef.current = strokes;
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, BOARD_W, BOARD_H);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const seen = new Set(strokesRef.current.map((r) => r.segment));
    const rows = [...strokesRef.current, ...pendingRef.current.filter((r) => !seen.has(r.segment))];
    const paths = strokesToPaths(rows);
    const pen = penRef.current;
    if (pen) paths.push({ color: pen.color, width: pen.width, points: pen.points });
    for (const path of paths) {
      ctx.strokeStyle = path.color;
      ctx.fillStyle = path.color;
      ctx.lineWidth = path.width;
      const pts = path.points;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0][0], pts[0][1], path.width / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
  }, []);
  useEffect(() => { redraw(); }, [strokes, state.game, redraw]);

  function enqueue(job: () => Promise<void>) {
    queueRef.current = queueRef.current.then(job).catch(() => undefined);
    return queueRef.current;
  }

  // Sends the part of the current stroke that is not on the server yet, in order.
  function flush() {
    const pen = penRef.current;
    const supabase = supabaseRef.current;
    const id = gameRef.current;
    if (!pen || !supabase || !id) return;
    while (pen.sent < pen.points.length) {
      const start = Math.max(0, pen.sent - 1);
      const chunk = pen.points.slice(start, start + 250);
      if (chunk.length === 1 && pen.sent > 0) break;
      pen.sent = start + chunk.length;
      if (!isValidSegment(chunk, pen.color, pen.width)) continue;
      const segment = crypto.randomUUID();
      pendingRef.current.push({ seq: 1e15 + pendingRef.current.length, stroke: pen.id, segment, color: pen.color, width: pen.width, points: chunk });
      enqueue(async () => {
        const { data, error: failure } = await supabase.rpc("add_draw_stroke", {
          game: id, stroke_id: pen.id, segment_id: segment, pen_color: pen.color, pen_width: pen.width, pts: chunk,
        });
        if (failure) setError(t(roomErrorKey(failure.message)));
        else if (data === false) refresh();
      });
    }
  }

  function toBoard(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * BOARD_W;
    const y = ((e.clientY - rect.top) / rect.height) * BOARD_H;
    return [Math.round(Math.min(BOARD_W, Math.max(0, x))), Math.round(Math.min(BOARD_H, Math.max(0, y)))];
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawer || !live || left === 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    penRef.current = { id: crypto.randomUUID(), color, width, points: [toBoard(e)], sent: 0 };
    clearInterval(flushTimer.current);
    flushTimer.current = setInterval(flush, 150);
    redraw();
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const pen = penRef.current;
    if (!pen) return;
    const p = toBoard(e);
    const last = pen.points[pen.points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 3) return;
    pen.points.push(p);
    redraw();
  }
  function up() {
    if (!penRef.current) return;
    clearInterval(flushTimer.current);
    flush();
    penRef.current = null;
    redraw();
  }
  useEffect(() => () => clearInterval(flushTimer.current), []);

  // ---------------------------------------------------------------- commands
  async function call(fn: string, args: Record<string, unknown>) {
    const supabase = supabaseRef.current;
    if (!supabase) return null;
    setBusy(true);
    const { data, error: failure } = await supabase.rpc(fn, args);
    setBusy(false);
    setError(failure ? t(roomErrorKey(failure.message)) : "");
    await refresh();
    return failure ? null : data;
  }
  async function tool(fn: "undo_draw_stroke" | "clear_draw_strokes") {
    const id = gameRef.current;
    const supabase = supabaseRef.current;
    if (!id || !supabase) return;
    await enqueue(async () => {
      const { error: failure } = await supabase.rpc(fn, { game: id });
      if (failure) setError(t(roomErrorKey(failure.message)));
    });
    pendingRef.current = [];
    await loadBoard(id);
  }
  async function submitGuess(e: React.FormEvent) {
    e.preventDefault();
    const id = gameRef.current;
    const attempt = text.trim();
    if (!id || !attempt) return;
    const result = await call("guess_draw", { game: id, attempt });
    setText("");
    if (result === "wrong") setNote(t("draw.wrong"));
    else if (result === "correct") setNote(t("draw.correct"));
    else setNote("");
    if (gameRef.current) await loadBoard(gameRef.current);
  }

  // ---------------------------------------------------------------- screens
  if (!game) {
    return (
      <div className="draw">
        <section className="sheet draw-intro">
          <h2>{t("draw.title")}</h2>
          <p className="lead">{t("draw.intro")}</p>
          <CategoryPicker value={category} onChange={setCategory} />
          <RolePicker value={iDraw} onChange={setIDraw} partnerName={partnerName} />
          <button type="button" className="button" disabled={busy} onClick={() => call("start_draw_game", { target: roomId, cat: category, i_draw: iDraw })}>{t("guess.start")}</button>
          {error && <p role="alert" className="error">{error}</p>}
        </section>
        <Records records={state.records} />
      </div>
    );
  }

  const myRoleText = isDrawer ? t("draw.drawer") : t("draw.guesser");
  const shown = (w: { word: string; wordEn?: string | null }) => wordIn(locale, w.word, w.wordEn);
  const outcome = (o: "correct" | "pass" | null) => t(o === "correct" ? "draw.outcome.correct" : o === "pass" ? "draw.outcome.pass" : "draw.outcome.missed");
  const isNewBest = game.phase === "done" && game.score > 0 && game.records[game.category] === game.score;

  return (
    <div className="draw">
      <section className="sheet draw-head" aria-label={t("draw.now")}>
        <p className="round-no"><Rich text={t("draw.iAm", { cat: categoryLabel(game.category, t) })} parts={{ role: <strong>{myRoleText}</strong> }} /></p>
        {game.phase === "lobby" && (
          <div className="draw-lobby">
            <p className="lead">{t("draw.readyHint")}</p>
            <p className="waiting" aria-live="polite">
              {game.meReady ? t("draw.meReady", { name: partnerName }) : game.partnerReady ? t("draw.partnerReady", { name: partnerName }) : t("draw.nobodyReady")}
            </p>
            <div className="draw-actions">
              <button type="button" className="button" disabled={busy || game.meReady} onClick={() => call("ready_draw_game", { game: game.game })}>
                {game.meReady ? t("draw.readyDone") : t("draw.ready")}
              </button>
              <button type="button" className="button ghost" disabled={busy} onClick={() => call("cancel_draw_game", { game: game.game })}>{t("draw.rechoose")}</button>
            </div>
          </div>
        )}
        {game.phase === "live" && (
          <>
            <div className="draw-live-row">
              <p className="draw-timer" role="timer"><Rich text={t("draw.left")} parts={{ n: <strong suppressHydrationWarning>{left}</strong> }} /></p>
              <p className="draw-score" aria-live="polite"><span>{t("draw.score")}</span> <strong data-testid="draw-score">{game.score}</strong></p>
            </div>
            {isDrawer && game.word && (
              <div className="draw-word-row">
                <p className="draw-word">{t("draw.word", { n: game.wordNo })} <strong>{wordIn(locale, game.word, game.wordEn)}</strong></p>
                <button type="button" className="button ghost" disabled={busy} onClick={() => call("pass_draw_word", { game: game.game })}>{t("draw.pass")}</button>
              </div>
            )}
            {!isDrawer && <p className="lead">{t("draw.guessPrompt", { n: game.wordNo, name: partnerName })}</p>}
            <div className="draw-bar" aria-hidden="true">
              <span suppressHydrationWarning style={{ transform: `scaleX(${game.deadlineMs ? timeShare(game.deadlineMs, Date.now(), offsetRef.current) : 0})` }} />
            </div>
          </>
        )}
        {game.phase === "done" && (
          <div className="draw-result" aria-live="polite">
            <h2>{t("draw.timeUp")}</h2>
            <p className="lead">
              <Rich
                text={t("draw.final", { passes: game.passes > 0 ? " " + t("draw.passes", { n: game.passes }) : "" })}
                parts={{ n: <strong data-testid="draw-final">{t("draw.finalN", { n: game.score })}</strong> }}
              />
            </p>
            {isNewBest && <p className="hit">{t("draw.best")}</p>}
            {game.words.length > 0 && (
              <ol className="draw-word-list">
                {game.words.map((w) => (
                  <li key={w.n} data-outcome={w.outcome ?? "missed"}>
                    {shown(w)} <span>{outcome(w.outcome)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </section>

      {game.phase !== "lobby" && (
        <section className="sheet draw-stage" aria-label={t("draw.board")}>
          <canvas
            ref={canvasRef}
            className="draw-canvas"
            width={BOARD_W}
            height={BOARD_H}
            data-role={game.role}
            role="img"
            aria-label={isDrawer ? t("draw.boardDrawer") : t("draw.boardGuesser", { name: partnerName })}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
          {isDrawer && live && (
            <div className="draw-tools" role="group" aria-label={t("draw.tools")}>
              <div className="swatches" role="radiogroup" aria-label={t("draw.color")}>
                {penColors.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={t("draw.colorN", { c })} className="swatch" data-on={color === c} style={{ background: c }} onClick={() => setColor(c)} />
                ))}
              </div>
              <div className="widths" role="radiogroup" aria-label={t("draw.widthLabel")}>
                {penWidths.map((w) => (
                  <button key={w.value} type="button" role="radio" aria-checked={width === w.value} className="width" data-on={width === w.value} onClick={() => setWidth(w.value)}>{t(`draw.width.${w.value}`)}</button>
                ))}
              </div>
              <button type="button" className="button ghost" onClick={() => tool("undo_draw_stroke")}>{t("draw.undo")}</button>
              <button type="button" className="button ghost" onClick={() => tool("clear_draw_strokes")}>{t("draw.clear")}</button>
            </div>
          )}
        </section>
      )}

      {game.phase === "live" && !isDrawer && (
        <form className="sheet draw-guess" onSubmit={submitGuess}>
          <label htmlFor="draw-guess-input">{t("draw.answer")}</label>
          <div className="chat-form">
            <input id="draw-guess-input" value={text} maxLength={30} autoComplete="off" onChange={(e) => setText(e.target.value)} />
            <button type="submit" disabled={busy || !text.trim()}>{t("draw.submit")}</button>
          </div>
          {note && <p className="waiting" role="status">{note}</p>}
        </form>
      )}

      {game.phase === "live" && game.words.length > 0 && (
        <section className="sheet" aria-label={t("draw.past")}>
          <h3>{t("draw.past")}</h3>
          <ol className="draw-word-list">
            {game.words.map((w) => (
              <li key={w.n} data-outcome={w.outcome ?? "missed"}>{shown(w)} <span>{outcome(w.outcome)}</span></li>
            ))}
          </ol>
        </section>
      )}

      {game.phase === "live" && guesses.length > 0 && (
        <section className="sheet" aria-label={t("draw.tries")}>
          <h3>{t("draw.triesNow")}</h3>
          <ul className="draw-guesses">
            {guesses.map((g) => (
              <li key={g.id} data-correct={g.correct}>{g.guess} <span>{g.correct ? t("draw.outcome.correct") : t("draw.no")}</span></li>
            ))}
          </ul>
        </section>
      )}

      {game.phase === "done" && (
        <section className="sheet draw-again">
          <h3>{t("draw.again")}</h3>
          <CategoryPicker value={category} onChange={setCategory} />
          <RolePicker value={iDraw} onChange={setIDraw} partnerName={partnerName} />
          <button type="button" className="button" disabled={busy} onClick={() => call("start_draw_game", { target: roomId, cat: category, i_draw: iDraw })}>{t("draw.again")}</button>
        </section>
      )}

      <Records records={game.records} />
      {error && <p role="alert" className="error">{error}</p>}
      <p className="hint draw-total">{t("draw.limit", { s: DRAW_SECONDS })}</p>
    </div>
  );
}

function CategoryPicker({ value, onChange }: { value: DrawCategory; onChange: (v: DrawCategory) => void }) {
  const { t } = useT();
  return (
    <fieldset className="draw-cats">
      <legend>{t("draw.category")}</legend>
      <div className="choice-grid six">
        {drawCategories.map((c) => (
          <label key={c.value} className="choice">
            <input type="radio" name="draw-category" value={c.value} checked={value === c.value} onChange={() => onChange(c.value)} />
            <span>{t(`draw.cat.${c.value}`)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function RolePicker({ value, onChange, partnerName }: { value: boolean; onChange: (v: boolean) => void; partnerName: string }) {
  const { t } = useT();
  return (
    <fieldset className="draw-cats">
      <legend>{t("draw.who")}</legend>
      <div className="choice-grid two">
        <label className="choice">
          <input type="radio" name="draw-role" checked={value} onChange={() => onChange(true)} />
          <span>{t("draw.iDraw")}</span>
        </label>
        <label className="choice">
          <input type="radio" name="draw-role" checked={!value} onChange={() => onChange(false)} />
          <span>{t("draw.theyDraw", { name: partnerName })}</span>
        </label>
      </div>
    </fieldset>
  );
}

function Records({ records }: { records: DrawRecords }) {
  const { t } = useT();
  return (
    <section className="sheet draw-records" aria-label={t("draw.recordsTitle")}>
      <h3>{t("draw.recordsTitle")}</h3>
      <dl>
        {drawCategories.map((c) => (
          <div key={c.value}>
            <dt>{t(`draw.cat.${c.value}`)}</dt>
            <dd>{recordText(records[c.value], t)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
