"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BIG, THUMB, albumErrorKey, fitSize, photoFile } from "../../../core/album";
import { roomErrorKey } from "../../../core/auth-paths";
import {
  SKETCH_H, SKETCH_W, drawSketchStamp, drawSmoothPath, groupSketchPaths, isValidSketchStroke,
  renderSketchScene, sketchBgHex, sketchBgs, sketchColors, sketchStamps, sketchWidths,
  type SketchBg, type SketchKind, type SketchPoint, type SketchState, type SketchStrokeRow,
} from "../../../core/sketch";
import { useT } from "../../../i18n/client";
import { browserClient } from "../../../lib/supabase/browser";
import { useRoomChannel } from "../use-room-channel";

type ActivePen = {
  id: string;
  kind: "pen" | "erase";
  color: string;
  width: number;
  points: SketchPoint[];
  sent: number;
};

type LiveStrokePayload = {
  stroke: string;
  kind: "pen" | "erase" | "cursor";
  color?: string;
  width?: number;
  points?: SketchPoint[];
};

async function encodeCanvasJpeg(source: HTMLCanvasElement, max: number) {
  const size = fitSize(source.width, source.height, max);
  const out = document.createElement("canvas");
  out.width = size.width;
  out.height = size.height;
  out.getContext("2d")!.drawImage(source, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((done) => out.toBlob(done, "image/jpeg", max === BIG ? 0.88 : 0.82));
  if (!blob) throw new Error("encode");
  return { blob, ...size };
}

export function SketchBoard({ roomId, initial, partnerName }: { roomId: string; initial: SketchState; partnerName: string }) {
  const { t } = useT();
  const router = useRouter();
  const roomChannel = useRoomChannel(roomId);

  const [bg, setBg] = useState<SketchBg>(initial.bg);
  const [strokes, setStrokes] = useState<SketchStrokeRow[]>(initial.strokes);
  const [hasExtToken, setHasExtToken] = useState<boolean>(Boolean(initial.hasExtensionToken));
  const [tool, setTool] = useState<SketchKind>("pen");
  const [color, setColor] = useState<string>(sketchColors[0]);
  const [width, setWidth] = useState<number>(sketchWidths[1]);
  const [stamp, setStamp] = useState<string>(sketchStamps[0]);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");

  // Extension bridge state
  const [extInstalled, setExtInstalled] = useState(false);
  const [extPairedLocal, setExtPairedLocal] = useState(false);
  const [issuedCode, setIssuedCode] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [partnerCursor, setPartnerCursor] = useState<{ x: number; y: number; until: number } | null>(null);

  const supabaseRef = useRef<ReturnType<typeof browserClient>>(null);
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof browserClient>>["channel"]> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<SketchStrokeRow[]>(initial.strokes);
  const pendingRef = useRef<SketchStrokeRow[]>([]);
  const penRef = useRef<ActivePen | null>(null);
  const livePartnerRef = useRef<Map<string, { color: string; width: number; erase: boolean; points: SketchPoint[]; at: number }>>(new Map());
  const revRef = useRef<number>(initial.revision);
  const seqRef = useRef<number>(initial.latestSeq);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const flushTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const liveSendAt = useRef(0);
  const rafRef = useRef(0);

  strokesRef.current = strokes;

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const targetW = Math.round(SKETCH_W * dpr);
      const targetH = Math.round(SKETCH_H * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const seen = new Set(strokesRef.current.map((s) => s.segment));
      const combined = [...strokesRef.current, ...pendingRef.current.filter((s) => !seen.has(s.segment))];
      const paths = groupSketchPaths(combined);
      renderSketchScene(ctx, paths);

      const now = Date.now();
      for (const [sid, live] of livePartnerRef.current.entries()) {
        if (now - live.at > 6000) {
          livePartnerRef.current.delete(sid);
          continue;
        }
        drawSmoothPath(ctx, live.points, live.color, live.width, live.erase);
      }

      const pen = penRef.current;
      if (pen) {
        drawSmoothPath(ctx, pen.points, pen.color, pen.width, pen.kind === "erase");
      }
    });
  }, []);

  useEffect(() => {
    scheduleDraw();
  }, [strokes, bg, scheduleDraw]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearInterval(flushTimer.current);
    };
  }, []);

  const refresh = useCallback(async (full = false) => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const { data, error: failure } = await supabase.rpc("sketch_state", {
      target: roomId,
      since_seq: full ? 0 : seqRef.current,
      since_rev: full ? null : revRef.current,
    });
    if (failure || !data) return;
    const next = data as SketchState & { incremental?: boolean };
    revRef.current = next.revision;
    seqRef.current = next.latestSeq;
    setBg(next.bg);
    setHasExtToken(Boolean(next.hasExtensionToken));

    // Expire partner live overlays that are already persisted
    livePartnerRef.current.clear();

    if (next.incremental) {
      if (next.strokes.length > 0) {
        setStrokes((prev) => {
          const have = new Set(prev.map((r) => r.segment));
          const add = next.strokes.filter((r) => !have.has(r.segment));
          if (add.length === 0) return prev;
          const addSegments = new Set(add.map((r) => r.segment));
          pendingRef.current = pendingRef.current.filter((p) => !addSegments.has(p.segment));
          return [...prev, ...add];
        });
      }
    } else {
      const serverSegments = new Set(next.strokes.map((r) => r.segment));
      pendingRef.current = pendingRef.current.filter((p) => !serverSegments.has(p.segment));
      setStrokes(next.strokes);
    }
    scheduleDraw();
  }, [roomId, scheduleDraw]);

  useEffect(() => {
    const supabase = browserClient();
    supabaseRef.current = supabase;
    if (!supabase) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    const reread = (full = false) => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(full), 80);
    };

    (async () => {
      await supabase.realtime.setAuth();
      if (!active) return;
      channel = roomChannel(supabase)
        .on("broadcast", { event: "sketch" }, () => reread(false))
        .on("broadcast", { event: "sketch_live" }, ({ payload }) => {
          const p = payload as LiveStrokePayload | undefined;
          if (!p) return;
          if (p.kind === "cursor" && p.points?.[0]) {
            setPartnerCursor({ x: p.points[0][0], y: p.points[0][1], until: Date.now() + 2400 });
            return;
          }
          if ((p.kind === "pen" || p.kind === "erase") && p.stroke && p.points?.length) {
            livePartnerRef.current.set(p.stroke, {
              color: p.color ?? "#2a1f26",
              width: p.width ?? 9,
              erase: p.kind === "erase",
              points: p.points,
              at: Date.now(),
            });
            const tip = p.points[p.points.length - 1];
            setPartnerCursor({ x: tip[0], y: tip[1], until: Date.now() + 2400 });
            scheduleDraw();
          }
        })
        .on("broadcast", { event: "members" }, () => router.refresh())
        .subscribe((status) => {
          document.documentElement.dataset.roomLive = status === "SUBSCRIBED" ? "on" : "off";
          if (status === "SUBSCRIBED") reread(false);
        });
      channelRef.current = channel;
    })();

    const beat = setInterval(() => {
      if (!document.hidden) void refresh(false);
    }, 15_000);
    const cursorTimer = setInterval(() => {
      setPartnerCursor((cur) => (cur && Date.now() > cur.until ? null : cur));
    }, 600);

    return () => {
      active = false;
      clearTimeout(timer);
      clearInterval(beat);
      clearInterval(cursorTimer);
      channelRef.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [roomChannel, roomId, refresh, router, scheduleDraw]);

  // Listen for Chrome extension bridge (duri-bridge.js)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin || e.data?.duri !== "from-ext") return;
      if (e.data.type === "hello") {
        setExtInstalled(true);
        window.postMessage({ duri: "to-ext", type: "sketch-status" }, window.location.origin);
      } else if (e.data.type === "sketch-status") {
        setExtInstalled(true);
        setExtPairedLocal(Boolean(e.data.paired));
      }
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ duri: "to-ext", type: "ping" }, window.location.origin);
    window.postMessage({ duri: "to-ext", type: "sketch-status" }, window.location.origin);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  function enqueue(job: () => Promise<void>) {
    queueRef.current = queueRef.current.then(job).catch(() => undefined);
    return queueRef.current;
  }

  function sendLive(payload: LiveStrokePayload) {
    const ch = channelRef.current;
    if (!ch) return;
    const now = performance.now();
    if (now - liveSendAt.current < 45) return;
    liveSendAt.current = now;
    void ch.send({ type: "broadcast", event: "sketch_live", payload });
  }

  function flushPen() {
    const pen = penRef.current;
    const supabase = supabaseRef.current;
    if (!pen || !supabase) return;
    while (pen.sent < pen.points.length) {
      const start = Math.max(0, pen.sent - 1);
      const chunk = pen.points.slice(start, start + 250);
      if (chunk.length === 1 && pen.sent > 0) break;
      pen.sent = start + chunk.length;
      if (!isValidSketchStroke(pen.kind, chunk, pen.color, pen.width, null)) continue;
      const segment = crypto.randomUUID();
      pendingRef.current.push({
        seq: 1e15 + pendingRef.current.length,
        stroke: pen.id,
        segment,
        by: "me",
        kind: pen.kind,
        color: pen.color,
        width: pen.width,
        points: chunk,
        stamp: null,
      });
      enqueue(async () => {
        const { error: failure } = await supabase.rpc("add_sketch_stroke", {
          target: roomId,
          stroke_id: pen.id,
          segment_id: segment,
          kind: pen.kind,
          pen_color: pen.color,
          pen_width: pen.width,
          pts: chunk,
          stamp_txt: null,
        });
        if (failure) setError(t(roomErrorKey(failure.message)));
      });
    }
  }

  function toBoard(e: React.PointerEvent<HTMLCanvasElement>): SketchPoint {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SKETCH_W;
    const y = ((e.clientY - rect.top) / rect.height) * SKETCH_H;
    return [
      Math.round(Math.min(SKETCH_W, Math.max(0, x)) * 10) / 10,
      Math.round(Math.min(SKETCH_H, Math.max(0, y)) * 10) / 10,
    ];
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const pt = toBoard(e);
    setError("");
    if (tool === "stamp") {
      const supabase = supabaseRef.current;
      if (!supabase) return;
      const strokeId = crypto.randomUUID();
      const segmentId = crypto.randomUUID();
      const stampSize = 44;
      pendingRef.current.push({
        seq: 1e15 + pendingRef.current.length,
        stroke: strokeId,
        segment: segmentId,
        by: "me",
        kind: "stamp",
        color: "#2a1f26",
        width: stampSize,
        points: [pt],
        stamp,
      });
      scheduleDraw();
      enqueue(async () => {
        const { error: failure } = await supabase.rpc("add_sketch_stroke", {
          target: roomId,
          stroke_id: strokeId,
          segment_id: segmentId,
          kind: "stamp",
          pen_color: "#2a1f26",
          pen_width: stampSize,
          pts: [pt],
          stamp_txt: stamp,
        });
        if (failure) setError(t(roomErrorKey(failure.message)));
      });
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    const penWidth = tool === "erase" ? Math.max(18, width * 2) : width;
    penRef.current = {
      id: crypto.randomUUID(),
      kind: tool === "erase" ? "erase" : "pen",
      color,
      width: penWidth,
      points: [pt],
      sent: 0,
    };
    clearInterval(flushTimer.current);
    flushTimer.current = setInterval(flushPen, 140);
    scheduleDraw();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const pt = toBoard(e);
    const pen = penRef.current;
    if (!pen) {
      sendLive({ stroke: "cursor", kind: "cursor", points: [pt] });
      return;
    }
    const last = pen.points[pen.points.length - 1];
    if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 2.2) return;
    pen.points.push(pt);
    scheduleDraw();
    sendLive({
      stroke: pen.id,
      kind: pen.kind,
      color: pen.color,
      width: pen.width,
      points: pen.points.slice(-120),
    });
  }

  function onPointerUp() {
    const pen = penRef.current;
    if (!pen) return;
    clearInterval(flushTimer.current);
    flushPen();
    penRef.current = null;
    scheduleDraw();
  }

  async function handleUndo() {
    const supabase = supabaseRef.current;
    if (!supabase || busy) return;
    setBusy(true);
    pendingRef.current = [];
    await enqueue(async () => {
      const { error: failure } = await supabase.rpc("undo_sketch_stroke", { target: roomId });
      if (failure) setError(t(roomErrorKey(failure.message)));
    });
    await refresh(true);
    setBusy(false);
  }

  async function handleClear() {
    const supabase = supabaseRef.current;
    if (!supabase || busy) return;
    setBusy(true);
    setConfirmClear(false);
    pendingRef.current = [];
    await enqueue(async () => {
      const { error: failure } = await supabase.rpc("clear_sketch_board", { target: roomId });
      if (failure) setError(t(roomErrorKey(failure.message)));
    });
    await refresh(true);
    setBusy(false);
  }

  async function handleBg(nextBg: SketchBg) {
    const supabase = supabaseRef.current;
    if (!supabase || nextBg === bg) return;
    setBg(nextBg);
    const { error: failure } = await supabase.rpc("set_sketch_bg", { target: roomId, next_bg: nextBg });
    if (failure) setError(t(roomErrorKey(failure.message)));
  }

  function composeExportCanvas(): HTMLCanvasElement | null {
    const src = canvasRef.current;
    if (!src) return null;
    const flat = document.createElement("canvas");
    flat.width = SKETCH_W;
    flat.height = SKETCH_H;
    const fctx = flat.getContext("2d");
    if (!fctx) return null;
    fctx.fillStyle = sketchBgHex[bg];
    fctx.fillRect(0, 0, SKETCH_W, SKETCH_H);
    fctx.drawImage(src, 0, 0, SKETCH_W, SKETCH_H);
    return flat;
  }

  function downloadPng() {
    const flat = composeExportCanvas();
    if (!flat) return;
    const a = document.createElement("a");
    a.href = flat.toDataURL("image/png");
    a.download = `duri-sketch-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  }

  async function saveToAlbum() {
    const supabase = supabaseRef.current;
    const flat = composeExportCanvas();
    if (!supabase || !flat || busy) return;
    setBusy(true);
    setError("");
    setStatusMsg("");
    try {
      const big = await encodeCanvasJpeg(flat, BIG);
      const small = await encodeCanvasJpeg(flat, THUMB);
      const id = crypto.randomUUID();
      const bucket = supabase.storage.from("room-photos");
      const up1 = await bucket.upload(photoFile(roomId, id), big.blob, { contentType: "image/jpeg", upsert: false });
      const up2 = up1.error ? up1 : await bucket.upload(photoFile(roomId, id, true), small.blob, { contentType: "image/jpeg", upsert: false });
      if (up2.error) throw up2.error;
      const { error: rpcErr } = await supabase.rpc("add_room_photo", { target: roomId, photo: id, w: big.width, h: big.height });
      if (rpcErr) {
        await bucket.remove([photoFile(roomId, id), photoFile(roomId, id, true)]);
        setError(t(albumErrorKey(rpcErr.message)));
      } else {
        setStatusMsg(t("sketch.savedAlbum"));
      }
    } catch {
      setError(t("album.err.upload"));
    } finally {
      setBusy(false);
    }
  }

  async function pairExtension() {
    const supabase = supabaseRef.current;
    if (!supabase || busy) return;
    setBusy(true);
    setError("");
    setCopiedCode(false);
    const { data, error: failure } = await supabase.rpc("issue_sketch_token", { target: roomId });
    setBusy(false);
    if (failure || typeof data !== "string") {
      setError(t(roomErrorKey(failure?.message)));
      return;
    }
    setHasExtToken(true);
    setIssuedCode(data);
    if (extInstalled) {
      window.postMessage(
        { duri: "to-ext", type: "sketch-pair", token: data, origin: window.location.origin, partnerName },
        window.location.origin,
      );
      setExtPairedLocal(true);
      setStatusMsg(t("sketch.extPaired"));
    }
  }

  async function unpairExtension() {
    const supabase = supabaseRef.current;
    if (!supabase || busy) return;
    setBusy(true);
    const { error: failure } = await supabase.rpc("revoke_sketch_token", { target: roomId });
    setBusy(false);
    if (failure) {
      setError(t(roomErrorKey(failure.message)));
      return;
    }
    setHasExtToken(false);
    setIssuedCode("");
    setExtPairedLocal(false);
    setStatusMsg("");
    if (extInstalled) {
      window.postMessage({ duri: "to-ext", type: "sketch-unpair" }, window.location.origin);
    }
  }

  async function copyCode() {
    if (!issuedCode) return;
    try {
      await navigator.clipboard.writeText(issuedCode);
      setCopiedCode(true);
    } catch {
      // Clipboard blocked
    }
  }

  const cursorStyle = useMemo(() => {
    if (!partnerCursor) return undefined;
    return {
      left: `${(partnerCursor.x / SKETCH_W) * 100}%`,
      top: `${(partnerCursor.y / SKETCH_H) * 100}%`,
    };
  }, [partnerCursor]);

  return (
    <div className="sketch">
      <section className="sheet sketch-head">
        <div>
          <h2>{t("sketch.title")}</h2>
          <p className="hint">{t("sketch.lead", { name: partnerName })}</p>
        </div>
        <div className="sketch-top-actions">
          <button type="button" className="button ghost" onClick={downloadPng}>{t("sketch.download")}</button>
          <button type="button" className="button" disabled={busy} onClick={() => void saveToAlbum()}>{t("sketch.saveAlbum")}</button>
        </div>
      </section>

      <section className="sheet sketch-stage" aria-label={t("sketch.boardLabel")}>
        <div className="sketch-canvas-box" data-bg={bg} style={{ backgroundColor: sketchBgHex[bg] }}>
          <canvas
            ref={canvasRef}
            className="sketch-canvas"
            data-testid="sketch-canvas"
            data-tool={tool}
            role="img"
            aria-label={t("sketch.boardLabel")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {partnerCursor && (
            <span className="sketch-partner-cursor" style={cursorStyle} aria-hidden="true">
              {partnerName}
            </span>
          )}
        </div>

        <div className="sketch-toolbar" role="group" aria-label={t("draw.tools")}>
          <div className="sketch-modes" role="radiogroup" aria-label={t("sketch.tool")}>
            {(["pen", "erase", "stamp"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={tool === k}
                className="width"
                data-on={tool === k}
                onClick={() => setTool(k)}
              >
                {t(`sketch.tool.${k}` as "sketch.tool.pen")}
              </button>
            ))}
          </div>

          {tool !== "stamp" && (
            <div className="widths" role="radiogroup" aria-label={t("draw.widthLabel")}>
              {sketchWidths.map((w) => (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={width === w}
                  className="width"
                  data-on={width === w}
                  onClick={() => setWidth(w)}
                >
                  {w}px
                </button>
              ))}
            </div>
          )}

          {tool === "stamp" ? (
            <div className="sketch-stamps" role="radiogroup" aria-label={t("sketch.stampPick")}>
              {sketchStamps.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={stamp === s}
                  className="sketch-stamp-btn"
                  data-on={stamp === s}
                  onClick={() => setStamp(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <div className="swatches" role="radiogroup" aria-label={t("draw.color")}>
              {sketchColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c && tool === "pen"}
                  aria-label={t("draw.colorN", { c })}
                  className="swatch"
                  data-on={color === c && tool === "pen"}
                  style={{ background: c }}
                  onClick={() => { setColor(c); setTool("pen"); }}
                />
              ))}
            </div>
          )}

          <div className="sketch-bgs" role="radiogroup" aria-label={t("sketch.paper")}>
            {sketchBgs.map((b) => (
              <button
                key={b}
                type="button"
                role="radio"
                aria-checked={bg === b}
                aria-label={t(`sketch.bg.${b}` as "sketch.bg.paper")}
                className="sketch-bg-btn"
                data-on={bg === b}
                style={{ backgroundColor: sketchBgHex[b] }}
                onClick={() => void handleBg(b)}
              />
            ))}
          </div>

          <div className="sketch-edit-btns">
            <button type="button" className="button ghost" disabled={busy} onClick={() => void handleUndo()}>{t("draw.undo")}</button>
            {!confirmClear ? (
              <button type="button" className="button ghost" disabled={busy} onClick={() => setConfirmClear(true)}>{t("draw.clear")}</button>
            ) : (
              <>
                <button type="button" className="button" disabled={busy} onClick={() => void handleClear()}>{t("sketch.clearYes")}</button>
                <button type="button" className="link" onClick={() => setConfirmClear(false)}>{t("gomoku.keepPlaying")}</button>
              </>
            )}
          </div>
        </div>

        {statusMsg && <p role="status" className="hit">{statusMsg}</p>}
        {error && <p role="alert" className="error">{error}</p>}
      </section>

      <section className="sheet sketch-ext" aria-labelledby="sketch-ext-head">
        <h3 id="sketch-ext-head">{t("sketch.extTitle")}</h3>
        <p className="hint">{t("sketch.extDesc")}</p>
        <p className="waiting" role="status">
          {extPairedLocal
            ? t("sketch.extConnected")
            : hasExtToken
              ? t("sketch.extIssued")
              : extInstalled
                ? t("sketch.extReady")
                : t("sketch.extNotDetected")}
        </p>
        <div className="draw-actions">
          <button type="button" className="button" disabled={busy} onClick={() => void pairExtension()}>
            {extPairedLocal || hasExtToken ? t("sketch.extReconnect") : t("sketch.extConnect")}
          </button>
          {(extPairedLocal || hasExtToken) && (
            <button type="button" className="button ghost" disabled={busy} onClick={() => void unpairExtension()}>
              {t("sketch.extDisconnect")}
            </button>
          )}
        </div>
        {issuedCode && !extPairedLocal && (
          <div className="sketch-code-box">
            <p className="hint">{t("sketch.extCodeHint")}</p>
            <div className="inline-field">
              <input type="text" readOnly value={issuedCode} aria-label={t("sketch.extCodeLabel")} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="button ghost" onClick={() => void copyCode()}>
                {copiedCode ? t("invite.copied") : t("sketch.extCopy")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
