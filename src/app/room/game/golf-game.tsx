"use client";
import { GameResult } from "./game-result";
import { useNewGameRefresh } from "./new-game";

import { useRoomChannel } from "../use-room-channel";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "../../../lib/supabase/browser";
import { roomErrorKey } from "../../../core/auth-paths";
import { simulateShot } from "../../../core/golf-physics";
import { useT } from "../../../i18n/client";
import {
  aimFromDrag,
  ballAt,
  bestLine,
  HOLE_CHOICES,
  replayDelay,
  runningStrokes,
  updateClock,
  type Clock,
  type GolfBall,
  type GolfCourse,
  type GolfState,
} from "../../../core/golf";

// Real-golf colours for the course drawing (the page around it uses the app's tokens).
const C = {
  rough: "#2e6b34",
  stripeA: "#5cab4f",
  stripeB: "#53a047",
  green: "#79c46a",
  greenEdge: "#5fae55",
  sand: "#ead49c",
  sandDot: "#cfb274",
  sandEdge: "#c9a965",
  water: "#3b8fd6",
  waterDeep: "#2c74b8",
  wave: "#9fd3f7",
  wood: "#7a5230",
  woodLight: "#a8774a",
  cup: "#141414",
  cupRim: "#f4f4f4",
  pole: "#f2f2f2",
  flag: "#e0342f",
  ballMe: "#ffffff",
  ballPartner: "#ffd84a",
  ink: "#17301b",
  shadow: "rgba(0,0,0,0.28)",
  aim: "rgba(255,255,255,0.95)",
};

type Phase = { meMoving: boolean; partnerMoving: boolean };

// 동시 미니골프. The database rolls each ball once and stores the path; this screen replays it on the shared
// database clock and turns a drag (anywhere on the course) into an angle and a power.
export function GolfGame({ roomId, initial, partnerName }: { roomId: string; initial: GolfState; partnerName: string }) {
  const { t } = useT();
  const router = useRouter();
  const roomChannel = useRoomChannel(roomId);
  const [state, setState] = useState<GolfState>(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [phase, setPhase] = useState<Phase>({ meMoving: false, partnerMoving: false });
  const supabaseRef = useRef<ReturnType<typeof browserClient>>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cssWidthRef = useRef(0);
  const stateRef = useRef<GolfState>(initial);
  const clockRef = useRef<Clock>({ offset: initial.nowMs - Date.now(), rtt: 10_000, at: Date.now() });
  const delayRef = useRef<Map<string, number>>(new Map()); // "me:3" -> ms the replay was shifted
  // My own shots replay from the moment I let go (database clock), not from the database's start, so the
  // ball moves at once and never jumps back when the answer arrives.
  const localStartRef = useRef<Map<string, number>>(new Map());
  const labelsRef = useRef({ me: "", partner: "" });
  const dragRef = useRef<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const phaseRef = useRef<Phase>({ meMoving: false, partnerMoving: false });

  // Remember, for each new shot, how late we first saw it: that delay is replayed instead of skipped.
  const noteShots = useCallback((st: GolfState) => {
    if (!st.game) return;
    const now = Date.now() + clockRef.current.offset;
    for (const [who, b] of [["me", st.me], ["pa", st.partner]] as const) {
      const key = `${who}:${st.game}:${st.hole}:${b.shotNo}`;
      if (b.startedMs !== null && !delayRef.current.has(key)) delayRef.current.set(key, replayDelay(now, b.startedMs));
    }
  }, []);

  const apply = useCallback((next: GolfState) => {
    noteShots(next);
    stateRef.current = next;
    setState(next);
  }, [noteShots]);

  const refresh = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const t0 = Date.now();
    const { data } = await supabase.rpc("golf_state", { target: roomId });
    const t1 = Date.now();
    if (!data) return;
    const next = data as GolfState;
    clockRef.current = updateClock(clockRef.current, next.nowMs, t0, t1);
    apply(next);
  }, [roomId, apply]);

  useNewGameRefresh(refresh);

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
        .on("broadcast", { event: "golf" }, () => void refresh())
        .on("broadcast", { event: "members" }, () => router.refresh())
        .subscribe((status) => {
          document.documentElement.dataset.roomLive = status === "SUBSCRIBED" ? "on" : "off";
          if (status === "SUBSCRIBED") void refresh();
        });
    })();
    // A few quick readings at the start give a good clock; then a slow heartbeat.
    const warm = [300, 900, 1800].map((ms) => setTimeout(() => void refresh(), ms));
    const beat = setInterval(() => void refresh(), 20_000);
    return () => {
      active = false;
      warm.forEach(clearTimeout);
      clearInterval(beat);
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomChannel, roomId, refresh, router]);

  const s = state.game ? state : null;
  const delayOf = (who: "me" | "pa", b: GolfBall) =>
    s ? delayRef.current.get(`${who}:${s.game}:${s.hole}:${b.shotNo}`) ?? 0 : 0;

  // When both balls are in the cup and both replays are over, ask once more: the database then moves on.
  const bothIn = Boolean(s && s.status === "open" && s.me.holed && s.partner.holed);
  const lastEnd = s ? Math.max(s.me.untilMs + delayOf("me", s.me), s.partner.untilMs + delayOf("pa", s.partner)) : 0;
  useEffect(() => {
    if (!bothIn) return;
    const wait = lastEnd - (Date.now() + clockRef.current.offset) + 900;
    const id = setTimeout(() => void refresh(), Math.max(300, wait));
    return () => clearTimeout(id);
  }, [bothIn, lastEnd, refresh]);

  // ---------------------------------------------------------------- drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    cssWidthRef.current = canvas.clientWidth;
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver((entries) => {
          const w = entries[0]?.contentRect.width;
          if (w) cssWidthRef.current = w;
        })
      : null;
    ro?.observe(canvas);
    let frame = 0;
    let layer: HTMLCanvasElement | null = null;
    let layerKey = "";
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const st = stateRef.current;
      if (!st.game) return;
      const c = st.course;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = cssWidthRef.current || canvas.clientWidth;
      if (!cssW) return;
      cssWidthRef.current = cssW;
      const w = Math.round(cssW * dpr);
      const h = Math.round(((cssW * c.h) / c.w) * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const k = w / c.w;
      const key = `${st.game}:${st.hole}:${w}`;
      if (key !== layerKey) { layer = drawCourse(c, w, h, k); layerKey = key; }
      const now = Date.now() + clockRef.current.offset;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (layer) ctx.drawImage(layer, 0, 0);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      drawFlag(ctx, c, now);

      const at = (who: "me" | "pa", b: GolfBall) => {
        const key = `${who}:${st.game}:${st.hole}:${b.shotNo}`;
        const local = localStartRef.current.get(key);
        const delay = delayRef.current.get(key) ?? 0;
        const elapsed = b.startedMs === null ? Infinity : local !== undefined ? now - local : now - b.startedMs - delay;
        return { ...ballAt(b, elapsed), elapsed, duration: b.startedMs === null ? 0 : b.untilMs - b.startedMs };
      };
      const mine = at("me", st.me);
      const theirs = at("pa", st.partner);
      const names = labelsRef.current;
      for (const [b, p, fill, label, mineBall] of [[st.partner, theirs, C.ballPartner, names.partner, false], [st.me, mine, C.ballMe, names.me, true]] as const) {
        if (b.water && b.path && p.elapsed >= p.duration && p.elapsed < p.duration + 900) {
          const [lx, ly] = b.path[b.path.length - 1];
          drawRipple(ctx, lx, ly, (p.elapsed - p.duration) / 900);
        }
        if (b.holed && !p.moving) continue; // in the cup
        drawBall(ctx, p.x, p.y, c.ball, fill, label, mineBall);
      }

      const d = dragRef.current;
      if (d && st.status === "open" && !st.me.holed && !mine.moving) drawAim(ctx, mine, d.from, d.to);

      const next = { meMoving: mine.moving, partnerMoving: theirs.moving };
      if (next.meMoving !== phaseRef.current.meMoving || next.partnerMoving !== phaseRef.current.partnerMoving) {
        phaseRef.current = next;
        setPhase(next);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      ro?.disconnect();
    };
  }, [state.game]);

  const open = Boolean(s && s.status === "open");
  const canShoot = Boolean(s && open && !s.me.holed && !phase.meMoving && !busy);

  async function send(aim: { angle: number; power: number }) {
    const supabase = supabaseRef.current;
    if (!supabase || !stateRef.current.game) return;
    // The database's clock for my last roll started a moment after my screen's; wait out that difference.
    const wait = (stateRef.current.game ? stateRef.current.me.untilMs : 0) - (Date.now() + clockRef.current.offset) + 40;
    if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, 1500)));
    const cur = stateRef.current;
    if (!cur.game) return;
    // 1) Roll at once with the same physics the database uses.
    const startDb = Date.now() + clockRef.current.offset;
    const sim = simulateShot(cur.course, cur.me.x, cur.me.y, aim.angle, aim.power);
    const shotNo = cur.me.shotNo + 1;
    const key = `me:${cur.game}:${cur.hole}:${shotNo}`;
    const strokes = Math.min(10, cur.me.strokes + 1 + (sim.water ? 1 : 0));
    localStartRef.current.set(key, startDb);
    apply({
      ...cur,
      me: { ...cur.me, path: sim.path, startedMs: startDb, untilMs: startDb + sim.ms, strokes, holed: sim.holed || strokes >= 10, water: sim.water, shotNo, x: sim.x, y: sim.y },
    });
    // 2) The database decides. Its path replaces the prediction on the same timeline.
    setBusy(true);
    const { data, error: failure } = await supabase.rpc("golf_shot", { game: cur.game, shot: crypto.randomUUID(), angle: aim.angle, power: aim.power });
    setBusy(false);
    if (failure || !data || data.status !== "ok") {
      localStartRef.current.delete(key);
      setError(failure ? t(roomErrorKey(failure.message)) : "");
      void refresh();
      return;
    }
    setError("");
    const now = stateRef.current;
    if (now.game === cur.game && now.hole === cur.hole && now.me.shotNo === shotNo) {
      const path = data.path as [number, number][];
      const end = data.water ? path[0] : path[path.length - 1];
      apply({ ...now, me: { ...now.me, path, startedMs: data.startedMs, untilMs: data.untilMs, strokes: data.n, holed: data.holed, water: data.water, x: end[0], y: end[1] } });
    }
    void refresh();
  }

  function logical(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const st = stateRef.current;
    if (!st.game) return { x: 0, y: 0 };
    return { x: ((e.clientX - r.left) / r.width) * st.course.w, y: ((e.clientY - r.top) / r.height) * st.course.h };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!canShoot) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = logical(e);
    dragRef.current = { from: p, to: p };
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current) dragRef.current.to = logical(e);
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const aim = aimFromDrag(d.from, logical(e));
    if (aim) void send(aim);
  }

  async function start(holes: number) {
    const supabase = supabaseRef.current;
    if (!supabase || busy) return;
    setBusy(true);
    const { error: failure } = await supabase.rpc("start_golf", { target: roomId, hole_count: holes });
    setError(failure ? t(roomErrorKey(failure.message)) : "");
    setSure(false);
    await refresh();
    setBusy(false);
  }
  async function cancel() {
    const supabase = supabaseRef.current;
    if (!supabase || !s) return;
    setBusy(true);
    const { error: failure } = await supabase.rpc("cancel_golf", { game: s.game });
    setError(failure ? t(roomErrorKey(failure.message)) : "");
    setSure(false);
    await refresh();
    setBusy(false);
  }

  labelsRef.current = { me: t("common.me"), partner: partnerName.length > 8 ? partnerName.slice(0, 7) + "…" : partnerName };
  const ballNote = (b: GolfBall, moving: boolean) =>
    b.holed && !moving ? t("golf.in") : moving ? t("golf.rolling") : b.water ? t("golf.splash") : t("golf.thisHole", { n: b.strokes });

  const headline = !s
    ? t("golf.none")
    : s.status === "done"
      ? t("golf.done", { n: s.me.total + s.partner.total })
      : s.status === "cancelled"
        ? t("golf.cancelled")
        : s.me.holed && s.partner.holed
          ? t("golf.bothIn")
          : s.me.holed
            ? t("golf.waitPartner", { name: partnerName })
            : phase.meMoving
              ? t("golf.myRolling")
              : t("golf.how");

  return (
    <div className="golf" data-status={s ? s.status : "none"} data-hole={s ? s.hole : ""}>
      {s?.status === "done" && <GameResult result={s.me.total === s.partner.total ? "tie" : s.me.total < s.partner.total ? "win" : "loss"} partnerName={partnerName} />}
      <section className="golf-head">
        <div>
          <h2>{t("golf.title")}</h2>
          {s && open && <p className="golf-hole">{t("golf.hole", { n: s.hole, of: s.holes, name: t(`golf.hole.${s.hole}` as "golf.hole.1") })}</p>}
        </div>
        {s && (
          <div className="golf-score" aria-label={t("golf.strokes")}>
            <div className="golf-count" data-who="me">
              <span className="golf-count-name">{t("common.me")}</span>
              <strong key={`me-${runningStrokes(s.me)}`} data-testid="golf-count-me">{runningStrokes(s.me)}</strong>
              <span className="golf-count-note">{ballNote(s.me, phase.meMoving)}</span>
            </div>
            <div className="golf-count" data-who="partner">
              <span className="golf-count-name">{partnerName}</span>
              <strong key={`pa-${runningStrokes(s.partner)}`} data-testid="golf-count-partner">{runningStrokes(s.partner)}</strong>
              <span className="golf-count-note">{ballNote(s.partner, phase.partnerMoving)}</span>
            </div>
          </div>
        )}
      </section>
      <p className="waiting" role="status" aria-live="polite">{headline}</p>

      {s && (
        <section className="golf-wrap" aria-label={t("golf.course")}>
          <canvas
            ref={canvasRef}
            className="golf-canvas"
            data-testid="golf-canvas"
            role="img"
            aria-label={t("golf.canvas", { name: partnerName })}
            data-can-shoot={String(canShoot)}
            data-me-moving={String(phase.meMoving)}
            data-partner-moving={String(phase.partnerMoving)}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={() => { dragRef.current = null; }}
          />
          <p className="hint">{t("golf.rules")}</p>
        </section>
      )}

      <section className="sheet">
        {!open && (
          <div className="draw-actions">
            {HOLE_CHOICES.map((n, i) => (
              <button key={n} type="button" className={i === 0 ? "button" : "button ghost"} disabled={busy} onClick={() => start(n)}>{t("golf.start", { n })}</button>
            ))}
          </div>
        )}
        <p className="hint">{bestLine(state.best, t)}</p>
        {open && !sure && <button type="button" className="link" onClick={() => setSure(true)}>{t("golf.stop")}</button>}
        {open && sure && (
          <div className="draw-actions">
            <span>{t("golf.stopSure")}</span>
            <button type="button" className="button ghost" disabled={busy} onClick={cancel}>{t("golf.stopYes")}</button>
            <button type="button" className="link" onClick={() => setSure(false)}>{t("gomoku.keepPlaying")}</button>
          </div>
        )}
        {error && <p role="alert" className="error">{error}</p>}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- course painting (once per hole)
function drawCourse(c: GolfCourse, w: number, h: number, k: number): HTMLCanvasElement {
  const layer = document.createElement("canvas");
  layer.width = w;
  layer.height = h;
  const g = layer.getContext("2d")!;
  g.setTransform(k, 0, 0, k, 0, 0);
  g.fillStyle = C.rough;
  g.fillRect(0, 0, c.w, c.h);
  // Mown stripes.
  for (let x = 0; x < c.w; x += 80) {
    g.fillStyle = (x / 80) % 2 === 0 ? C.stripeA : C.stripeB;
    g.fillRect(x, 0, 80, c.h);
  }
  // Putting green around the cup.
  g.fillStyle = C.greenEdge;
  g.beginPath(); g.arc(c.cup.x, c.cup.y, 78, 0, Math.PI * 2); g.fill();
  g.fillStyle = C.green;
  g.beginPath(); g.arc(c.cup.x, c.cup.y, 70, 0, Math.PI * 2); g.fill();
  // Sand with a stipple.
  let seed = c.n * 9973;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [x1, y1, x2, y2] of c.sand) {
    g.fillStyle = C.sandEdge;
    roundRect(g, x1 - 3, y1 - 3, x2 - x1 + 6, y2 - y1 + 6, 22); g.fill();
    g.fillStyle = C.sand;
    roundRect(g, x1, y1, x2 - x1, y2 - y1, 20); g.fill();
    g.fillStyle = C.sandDot;
    const dots = Math.round(((x2 - x1) * (y2 - y1)) / 260);
    for (let i = 0; i < dots; i++) g.fillRect(x1 + 8 + rand() * (x2 - x1 - 16), y1 + 8 + rand() * (y2 - y1 - 16), 2, 2);
  }
  // Water with soft waves.
  for (const [x1, y1, x2, y2] of c.water) {
    g.fillStyle = C.waterDeep;
    roundRect(g, x1 - 3, y1 - 3, x2 - x1 + 6, y2 - y1 + 6, 18); g.fill();
    g.fillStyle = C.water;
    roundRect(g, x1, y1, x2 - x1, y2 - y1, 16); g.fill();
    g.strokeStyle = C.wave; g.lineWidth = 2.5; g.lineCap = "round";
    for (let y = y1 + 22; y < y2 - 10; y += 34) {
      for (let x = x1 + 18 + ((y / 34) % 2) * 20; x < x2 - 30; x += 60) {
        g.beginPath(); g.arc(x + 10, y, 10, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      }
    }
  }
  // Tee box.
  g.fillStyle = "rgba(255,255,255,0.22)";
  roundRect(g, c.tee[0] - 26, c.tee[1] - 26, 52, 52, 8); g.fill();
  g.fillStyle = "#ffffff";
  g.beginPath(); g.arc(c.tee[0] - 18, c.tee[1] - 18, 4, 0, Math.PI * 2); g.arc(c.tee[0] + 18, c.tee[1] - 18, 4, 0, Math.PI * 2); g.fill();
  // Cup.
  g.fillStyle = C.cupRim;
  g.beginPath(); g.arc(c.cup.x, c.cup.y, c.cup.r + 3, 0, Math.PI * 2); g.fill();
  g.fillStyle = C.cup;
  g.beginPath(); g.arc(c.cup.x, c.cup.y, c.cup.r, 0, Math.PI * 2); g.fill();
  // Wooden rails (walls), with a light top edge.
  g.lineCap = "round";
  for (const [x1, y1, x2, y2] of c.walls) {
    g.strokeStyle = "rgba(0,0,0,0.25)"; g.lineWidth = 12;
    g.beginPath(); g.moveTo(x1 + 2, y1 + 3); g.lineTo(x2 + 2, y2 + 3); g.stroke();
    g.strokeStyle = C.wood; g.lineWidth = 10;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = C.woodLight; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x1, y1 - 1.5); g.lineTo(x2, y2 - 1.5); g.stroke();
  }
  return layer;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

function drawFlag(g: CanvasRenderingContext2D, c: GolfCourse, now: number) {
  const px = c.cup.x + 4, top = c.cup.y - 92;
  g.strokeStyle = C.pole; g.lineWidth = 4;
  g.beginPath(); g.moveTo(px, c.cup.y); g.lineTo(px, top); g.stroke();
  const wave = Math.sin(now / 260) * 5;
  g.fillStyle = C.flag;
  g.beginPath();
  g.moveTo(px, top);
  g.quadraticCurveTo(px + 22, top + 4 + wave, px + 44, top + 12 + wave * 0.6);
  g.lineTo(px, top + 30);
  g.closePath();
  g.fill();
  g.fillStyle = "#ffffff"; g.font = "bold 14px system-ui, sans-serif"; g.textAlign = "center";
  g.fillText(String(c.n), px + 16, top + 19 + wave * 0.3);
}

function drawBall(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, label: string, mine: boolean) {
  g.fillStyle = C.shadow;
  g.beginPath(); g.ellipse(x + 3, y + 5, r, r * 0.7, 0, 0, Math.PI * 2); g.fill();
  const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.2, x, y, r);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(1, fill === C.ballMe ? "#d9d9d9" : "#e0b52c");
  g.fillStyle = grad;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1.5; g.stroke();
  // My name sits above my ball, the partner's below theirs, so they never cover each other.
  const ly = mine ? y - r - 8 : y + r + 20;
  g.font = "bold 16px system-ui, sans-serif"; g.textAlign = "center";
  g.lineWidth = 4; g.strokeStyle = C.ink; g.strokeText(label, x, ly);
  g.fillStyle = fill; g.fillText(label, x, ly);
}

function drawRipple(g: CanvasRenderingContext2D, x: number, y: number, t: number) {
  g.strokeStyle = `rgba(255,255,255,${1 - t})`;
  g.lineWidth = 3;
  for (const s of [0, 0.35]) {
    const tt = Math.max(0, t - s);
    g.beginPath(); g.arc(x, y, 6 + tt * 36, 0, Math.PI * 2); g.stroke();
  }
}

function drawAim(g: CanvasRenderingContext2D, ball: { x: number; y: number }, from: { x: number; y: number }, to: { x: number; y: number }) {
  const aim = aimFromDrag(from, to);
  if (!aim) return;
  const len = 40 + aim.power * 220;
  g.setLineDash([3, 12]);
  g.lineCap = "round";
  g.strokeStyle = C.aim; g.lineWidth = 5;
  g.beginPath(); g.moveTo(ball.x, ball.y); g.lineTo(ball.x + Math.cos(aim.angle) * len, ball.y + Math.sin(aim.angle) * len); g.stroke();
  g.setLineDash([]);
  // Power ring around the ball: green -> yellow -> red.
  const hue = 120 - aim.power * 120;
  g.strokeStyle = `hsl(${hue} 85% 50%)`; g.lineWidth = 6;
  g.beginPath(); g.arc(ball.x, ball.y, 24, -Math.PI / 2, -Math.PI / 2 + aim.power * Math.PI * 2); g.stroke();
  g.fillStyle = "#ffffff"; g.font = "bold 15px system-ui, sans-serif"; g.textAlign = "center";
  g.lineWidth = 4; g.strokeStyle = C.ink;
  const label = `${Math.round(aim.power * 100)}%`;
  g.strokeText(label, ball.x, ball.y + 46); g.fillText(label, ball.x, ball.y + 46);
}
