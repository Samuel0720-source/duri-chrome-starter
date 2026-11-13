"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserClient } from "../../../lib/supabase/browser";
import { roomErrorMessage } from "../../../core/auth-paths";
import { aimFromButtons, aimFromDrag, ballAt, ballLine, bestLine, MAX_PULL, type GolfState } from "../../../core/golf";

// 동시 미니골프. The database rolls each ball once and stores the path; this screen only replays it on the shared
// database clock and turns a drag (or the buttons) into an angle and a power.
export function GolfGame({ roomId, initial }: { roomId: string; initial: GolfState }) {
  const [state, setState] = useState<GolfState>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [degrees, setDegrees] = useState(0);
  const [percent, setPercent] = useState(50);
  const [tick, setTick] = useState(0);
  const supabaseRef = useRef<ReturnType<typeof browserClient>>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GolfState>(initial);
  const offsetRef = useRef(initial.nowMs - Date.now()); // database clock minus this device's clock
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const colorsRef = useRef<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const { data } = await supabase.rpc("golf_state", { target: roomId });
    if (!data) return;
    const next = data as GolfState;
    offsetRef.current = next.nowMs - Date.now();
    stateRef.current = next;
    setState(next);
  }, [roomId]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const supabase = browserClient();
    supabaseRef.current = supabase;
    if (!supabase) return;
    let active = true;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    const reread = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => refresh(), 60);
    };
    (async () => {
      await supabase.realtime.setAuth();
      if (!active) return;
      channel = supabase
        .channel("room:" + roomId, { config: { private: true } })
        .on("broadcast", { event: "golf" }, reread)
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

  // When both balls are in the cup and the last replay is over, ask once more: the database then moves on.
  const s = state.game ? state : null;
  const meUntil = s?.me.untilMs ?? 0;
  const paUntil = s?.partner.untilMs ?? 0;
  const bothIn = Boolean(s && s.status === "open" && s.me.holed && s.partner.holed);
  useEffect(() => {
    if (!bothIn) return;
    const wait = Math.max(meUntil, paUntil) - (Date.now() + offsetRef.current) + 200;
    const id = setTimeout(() => refresh(), Math.max(200, wait));
    return () => clearTimeout(id);
  }, [bothIn, meUntil, paUntil, refresh]);

  // Re-render the text lines while a ball rolls (the canvas draws on its own loop).
  useEffect(() => {
    if (!s || s.status !== "open") return;
    const id = setInterval(() => setTick((t) => t + 1), 400);
    return () => clearInterval(id);
  }, [s]);

  // Canvas loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const ctx = canvas.getContext("2d");
    const read = () => {
      const cs = getComputedStyle(canvas);
      for (const k of ["paper-3", "paper-2", "ink", "ink-2", "accent", "rule", "muted", "paper"]) colorsRef.current[k] = cs.getPropertyValue(`--color-${k}`).trim() || "#888";
    };
    read();
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const st = stateRef.current;
      if (!ctx || !st.game) return;
      const c = st.course;
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      if (!cssW) return;
      const w = Math.round(cssW * dpr), h = Math.round((cssW * c.h) / c.w * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const k = w / c.w;
      const col = colorsRef.current;
      const now = Date.now() + offsetRef.current;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.fillStyle = col["paper-3"]; ctx.fillRect(0, 0, c.w, c.h);
      // cup
      ctx.fillStyle = col["ink"]; ctx.beginPath(); ctx.arc(c.cup.x, c.cup.y, c.cup.r, 0, Math.PI * 2); ctx.fill();
      // flag
      ctx.strokeStyle = col["ink-2"]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c.cup.x, c.cup.y); ctx.lineTo(c.cup.x, c.cup.y - 60); ctx.stroke();
      ctx.fillStyle = col["accent"]; ctx.beginPath(); ctx.moveTo(c.cup.x, c.cup.y - 60); ctx.lineTo(c.cup.x + 28, c.cup.y - 50); ctx.lineTo(c.cup.x, c.cup.y - 40); ctx.fill();
      // tee
      ctx.strokeStyle = col["muted"]; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(c.tee[0], c.tee[1], 20, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      // walls
      ctx.strokeStyle = col["ink"]; ctx.lineWidth = 6; ctx.lineCap = "round";
      for (const [x1, y1, x2, y2] of c.walls) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
      // balls (partner first, mine on top)
      const mine = ballAt(st.me, now), theirs = ballAt(st.partner, now);
      const drawBall = (b: { x: number; y: number }, holed: boolean, fill: string, ring: string) => {
        const r = holed ? c.ball * 0.6 : c.ball;
        ctx.fillStyle = fill; ctx.strokeStyle = ring; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      };
      drawBall(theirs, st.partner.holed, col["paper-2"], col["ink"]);
      drawBall(mine, st.me.holed, col["accent"], col["ink"]);
      // aim line
      const d = dragRef.current;
      if (d && st.status === "open" && !st.me.holed && !mine.moving) {
        const aim = aimFromDrag(mine, d);
        ctx.strokeStyle = col["accent"]; ctx.lineWidth = 4; ctx.setLineDash([2, 10]);
        ctx.beginPath(); ctx.moveTo(mine.x, mine.y);
        const pull = Math.min(MAX_PULL, Math.hypot(mine.x - d.x, mine.y - d.y));
        const a = aim ? aim.angle : Math.atan2(mine.y - d.y, mine.x - d.x);
        ctx.lineTo(mine.x + Math.cos(a) * pull * 1.6, mine.y + Math.sin(a) * pull * 1.6); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = col["muted"]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(mine.x, mine.y); ctx.lineTo(d.x, d.y); ctx.stroke();
      }
      canvas.dataset.meMoving = String(mine.moving);
      canvas.dataset.partnerMoving = String(theirs.moving);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [state.game]);

  const open = Boolean(s && s.status === "open");
  const nowDb = Date.now() + offsetRef.current;
  const myMoving = s ? ballAt(s.me, nowDb).moving : false;
  const canShoot = Boolean(s && open && !s.me.holed && !myMoving && !busy);
  void tick;

  async function send(aim: { angle: number; power: number }) {
    const supabase = supabaseRef.current;
    const st = stateRef.current;
    if (!supabase || !st.game) return;
    setBusy(true);
    const { error: failure } = await supabase.rpc("golf_shot", { game: st.game, shot: crypto.randomUUID(), angle: aim.angle, power: aim.power });
    setError(failure ? roomErrorMessage(failure.message) : "");
    await refresh();
    setBusy(false);
  }

  function logical(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const st = stateRef.current;
    if (!st.game) return { x: 0, y: 0 };
    return { x: ((e.clientX - r.left) / r.width) * st.course.w, y: ((e.clientY - r.top) / r.height) * st.course.h };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!canShoot || !s) return;
    const p = logical(e);
    const mine = ballAt(s.me, Date.now() + offsetRef.current);
    if (Math.hypot(p.x - mine.x, p.y - mine.y) > 70) return; // grab near your own ball
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = p;
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current) dragRef.current = logical(e);
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !s) return;
    const mine = ballAt(s.me, Date.now() + offsetRef.current);
    const aim = aimFromDrag(mine, logical(e));
    if (aim) void send(aim);
  }

  async function start(holes: 1 | 3) {
    const supabase = supabaseRef.current;
    if (!supabase || busy) return;
    setBusy(true);
    const { error: failure } = await supabase.rpc("start_golf", { target: roomId, hole_count: holes });
    setError(failure ? roomErrorMessage(failure.message) : "");
    setSure(false);
    await refresh();
    setBusy(false);
  }
  async function cancel() {
    const supabase = supabaseRef.current;
    if (!supabase || !s) return;
    setBusy(true);
    const { error: failure } = await supabase.rpc("cancel_golf", { game: s.game });
    setError(failure ? roomErrorMessage(failure.message) : "");
    setSure(false);
    await refresh();
    setBusy(false);
  }

  const headline = !s
    ? "아직 시작한 판이 없어요."
    : s.status === "done"
      ? `끝! 둘이 합쳐 ${s.me.total + s.partner.total}타예요.`
      : s.status === "cancelled"
        ? "이 판은 그만뒀어요."
        : s.me.holed && s.partner.holed
          ? "둘 다 컵인! 곧 다음 홀로 가요."
          : s.me.holed
            ? "컵인! 상대를 기다려요."
            : myMoving
              ? "공이 굴러가는 중이에요."
              : "내 공을 끌어당겼다 놓아 보세요. 둘이 동시에 칠 수 있어요.";

  return (
    <div className="golf" data-status={s ? s.status : "none"} data-hole={s ? s.hole : ""} data-me-holed={s ? String(s.me.holed) : ""} data-partner-holed={s ? String(s.partner.holed) : ""}>
      <section className="sheet">
        <h2>동시 미니골프</h2>
        <p className="waiting" role="status" aria-live="polite">{headline}</p>
        {s && open && (
          <p className="hint">
            {s.hole}/{s.holes}번째 홀 · 나 {ballLine(s.me, nowDb)} (합계 {s.me.total}) · 상대 {ballLine(s.partner, nowDb)} (합계 {s.partner.total})
          </p>
        )}
        {s && s.status === "done" && <p className="hint">나 {s.me.total}타 · 상대 {s.partner.total}타</p>}
        <p className="hint">{bestLine(state.best)}</p>
      </section>

      {s && (
        <section className="golf-wrap" aria-label="미니골프 코스">
          <canvas
            ref={canvasRef}
            className="golf-canvas"
            data-testid="golf-canvas"
            role="img"
            aria-label="미니골프 코스. 내 공은 진한 색이에요. 끌어당겼다 놓으면 공이 반대로 굴러가요."
            data-can-shoot={String(canShoot)}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => { dragRef.current = null; }}
          />
        </section>
      )}

      {s && open && (
        <section className="sheet">
          <details>
            <summary>버튼으로 치기</summary>
            <div className="golf-buttons">
              <label>방향 {degrees}° (0°=오른쪽, 90°=아래)
                <input type="range" min={0} max={359} value={degrees} onChange={(e) => setDegrees(Number(e.target.value))} />
              </label>
              <label>세기 {percent}%
                <input type="range" min={5} max={100} value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
              </label>
              <button type="button" className="button" disabled={!canShoot} onClick={() => send(aimFromButtons(degrees, percent))}>치기</button>
            </div>
          </details>
        </section>
      )}

      <section className="sheet">
        {!open && (
          <div className="draw-actions">
            <button type="button" className="button" disabled={busy} onClick={() => start(1)}>1홀 시작</button>
            <button type="button" className="button ghost" disabled={busy} onClick={() => start(3)}>3홀 시작</button>
          </div>
        )}
        {open && !sure && <button type="button" className="link" onClick={() => setSure(true)}>이 판 그만두기</button>}
        {open && sure && (
          <div className="draw-actions">
            <span>정말 그만둘까요? 기록은 남지 않아요.</span>
            <button type="button" className="button ghost" disabled={busy} onClick={cancel}>그만둘게요</button>
            <button type="button" className="link" onClick={() => setSure(false)}>계속하기</button>
          </div>
        )}
        {error && <p role="alert" className="error">{error}</p>}
      </section>
    </div>
  );
}
