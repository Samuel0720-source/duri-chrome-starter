"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserClient } from "../../../lib/supabase/browser";
import { roomErrorMessage } from "../../../core/auth-paths";
import {
  BOARD_H, BOARD_W, DRAW_SECONDS, clockOffset, categoryLabel, drawCategories, formatSeconds, isValidSegment,
  penColors, penWidths, secondsLeft, strokesToPaths, timeShare,
  type DrawCategory, type DrawGuess, type DrawRecords, type DrawState, type Point, type Stroke,
} from "../../../core/draw";

type Pen = { id: string; color: string; width: number; points: Point[]; sent: number };

// "100초 그림 퀴즈". What this screen may know comes only from draw_state() and the member-readable
// tables: the word reaches the drawer, and the guesser only after the round is over.
export function DrawGame({ roomId, initial }: { roomId: string; initial: DrawState }) {
  const [state, setState] = useState<DrawState>(initial);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [guesses, setGuesses] = useState<DrawGuess[]>([]);
  const [category, setCategory] = useState<DrawCategory>("food");
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
    setState(next);
  }, [roomId]);

  const loadBoard = useCallback(async (id: string) => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const [s, g] = await Promise.all([
      supabase.from("draw_strokes").select("seq, stroke, segment, color, width, points").eq("game_id", id).order("seq"),
      supabase.from("draw_guesses").select("id, player, guess, correct").eq("game_id", id).order("id"),
    ]);
    if (gameRef.current !== id) return;
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

  useEffect(() => {
    if (state.game) loadBoard(state.game);
    else {
      setStrokes([]);
      setGuesses([]);
      pendingRef.current = [];
    }
  }, [state.game, loadBoard]);

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
        if (failure) setError(roomErrorMessage(failure.message));
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
    setError(failure ? roomErrorMessage(failure.message) : "");
    await refresh();
    return failure ? null : data;
  }
  async function tool(fn: "undo_draw_stroke" | "clear_draw_strokes") {
    const id = gameRef.current;
    const supabase = supabaseRef.current;
    if (!id || !supabase) return;
    await enqueue(async () => {
      const { error: failure } = await supabase.rpc(fn, { game: id });
      if (failure) setError(roomErrorMessage(failure.message));
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
    if (result === "wrong") setNote("아니에요. 다시 도전해 보세요!");
    else setNote("");
    if (gameRef.current) await loadBoard(gameRef.current);
  }

  // ---------------------------------------------------------------- screens
  if (!game) {
    return (
      <div className="draw">
        <section className="sheet draw-intro">
          <h2>100초 그림 퀴즈</h2>
          <p className="lead">한 명이 제시어를 그리고, 다른 한 명이 100초 안에 맞혀요. 판마다 역할이 바뀌어요.</p>
          <CategoryPicker value={category} onChange={setCategory} />
          <button type="button" className="button" disabled={busy} onClick={() => call("start_draw_game", { target: roomId, cat: category })}>게임 시작</button>
          {error && <p role="alert" className="error">{error}</p>}
        </section>
        <Records records={state.records} />
      </div>
    );
  }

  const myRoleText = isDrawer ? "그리는 사람" : "맞히는 사람";
  const nextRoleText = isDrawer ? "맞히는 사람" : "그리는 사람";

  return (
    <div className="draw">
      <section className="sheet draw-head" aria-label="지금 판">
        <p className="round-no">{categoryLabel(game.category)} · 나는 <strong>{myRoleText}</strong></p>
        {game.phase === "lobby" && (
          <div className="draw-lobby">
            <p className="lead">둘 다 준비를 누르면 100초가 시작돼요. 시계는 서버가 재요.</p>
            <p className="waiting" aria-live="polite">
              {game.meReady ? "준비 완료. 상대를 기다리는 중이에요." : game.partnerReady ? "상대는 준비했어요." : "아직 아무도 준비하지 않았어요."}
            </p>
            <div className="draw-actions">
              <button type="button" className="button" disabled={busy || game.meReady} onClick={() => call("ready_draw_game", { game: game.game })}>
                {game.meReady ? "준비 완료" : "준비"}
              </button>
              <button type="button" className="button ghost" disabled={busy} onClick={() => call("cancel_draw_game", { game: game.game })}>카테고리 다시 고르기</button>
            </div>
          </div>
        )}
        {game.phase === "live" && (
          <>
            {isDrawer && game.word && <p className="draw-word">제시어 <strong>{game.word}</strong></p>}
            {!isDrawer && <p className="lead">상대가 그리는 그림을 보고 무엇인지 맞혀 보세요.</p>}
            <p className="draw-timer" role="timer"><strong>{left}</strong>초 남았어요</p>
            <div className="draw-bar" aria-hidden="true">
              <span style={{ transform: `scaleX(${game.deadlineMs ? timeShare(game.deadlineMs, Date.now(), offsetRef.current) : 0})` }} />
            </div>
          </>
        )}
        {game.phase === "done" && (
          <div className="draw-result" aria-live="polite">
            {game.result === "won" ? (
              <>
                <h2>정답!</h2>
                <p className="lead"><strong>{game.seconds !== null ? formatSeconds(game.seconds) : ""}</strong> 만에 맞혔어요. 정답은 <strong>{game.word}</strong></p>
                {game.seconds !== null && game.records[game.category] === game.seconds && <p className="hit">우리 커플 최고 기록이에요!</p>}
              </>
            ) : (
              <>
                <h2>시간 끝!</h2>
                <p className="lead">정답은 <strong>{game.word}</strong>였어요.</p>
              </>
            )}
          </div>
        )}
      </section>

      {game.phase !== "lobby" && (
        <section className="sheet draw-stage" aria-label="그림판">
          <canvas
            ref={canvasRef}
            className="draw-canvas"
            width={BOARD_W}
            height={BOARD_H}
            data-role={game.role}
            role="img"
            aria-label={isDrawer ? "그림판. 손가락이나 마우스로 그려요" : "상대가 그리는 그림"}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
          {isDrawer && live && (
            <div className="draw-tools" role="group" aria-label="그리기 도구">
              <div className="swatches" role="radiogroup" aria-label="펜 색">
                {penColors.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={"색 " + c} className="swatch" data-on={color === c} style={{ background: c }} onClick={() => setColor(c)} />
                ))}
              </div>
              <div className="widths" role="radiogroup" aria-label="펜 굵기">
                {penWidths.map((w) => (
                  <button key={w.value} type="button" role="radio" aria-checked={width === w.value} className="width" data-on={width === w.value} onClick={() => setWidth(w.value)}>{w.label}</button>
                ))}
              </div>
              <button type="button" className="button ghost" onClick={() => tool("undo_draw_stroke")}>되돌리기</button>
              <button type="button" className="button ghost" onClick={() => tool("clear_draw_strokes")}>전체 지우기</button>
            </div>
          )}
        </section>
      )}

      {game.phase === "live" && !isDrawer && (
        <form className="sheet draw-guess" onSubmit={submitGuess}>
          <label htmlFor="draw-guess-input">정답</label>
          <div className="chat-form">
            <input id="draw-guess-input" value={text} maxLength={30} autoComplete="off" onChange={(e) => setText(e.target.value)} />
            <button type="submit" disabled={busy || !text.trim()}>제출</button>
          </div>
          {note && <p className="waiting" role="status">{note}</p>}
        </form>
      )}

      {game.phase !== "lobby" && guesses.length > 0 && (
        <section className="sheet" aria-label="시도한 답">
          <h3>시도한 답</h3>
          <ul className="draw-guesses">
            {guesses.map((g) => (
              <li key={g.id} data-correct={g.correct}>{g.guess} <span>{g.correct ? "정답" : "아니에요"}</span></li>
            ))}
          </ul>
        </section>
      )}

      {game.phase === "done" && (
        <section className="sheet draw-again">
          <h3>한 판 더</h3>
          <p className="hint">다음 판에는 내가 <strong>{nextRoleText}</strong>이 돼요.</p>
          <CategoryPicker value={category} onChange={setCategory} />
          <button type="button" className="button" disabled={busy} onClick={() => call("start_draw_game", { target: roomId, cat: category })}>한 판 더</button>
        </section>
      )}

      <Records records={game.records} />
      {error && <p role="alert" className="error">{error}</p>}
      <p className="hint draw-total">제한 시간은 {DRAW_SECONDS}초예요.</p>
    </div>
  );
}

function CategoryPicker({ value, onChange }: { value: DrawCategory; onChange: (v: DrawCategory) => void }) {
  return (
    <fieldset className="draw-cats">
      <legend>카테고리</legend>
      <div className="choice-grid five">
        {drawCategories.map((c) => (
          <label key={c.value} className="choice">
            <input type="radio" name="draw-category" value={c.value} checked={value === c.value} onChange={() => onChange(c.value)} />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Records({ records }: { records: DrawRecords }) {
  return (
    <section className="sheet draw-records" aria-label="우리 커플 최고 기록">
      <h3>우리 커플 최고 기록</h3>
      <dl>
        {drawCategories.map((c) => (
          <div key={c.value}>
            <dt>{c.label}</dt>
            <dd>{records[c.value] === undefined ? "아직 없어요" : formatSeconds(records[c.value] as number)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
