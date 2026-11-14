"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { browserClient } from "../../../lib/supabase/browser";
import { roomErrorKey } from "../../../core/auth-paths";
import { clockOffset } from "../../../core/draw";
import {
  classifyRevision, formatClock, parseVideo, shouldCheckDrift, shouldCorrectDrift, targetPosition, videoPage,
  type VideoSource, type WatchState,
} from "../../../core/watch";
import { useT } from "../../../i18n/client";
import type { MessageKey } from "../../../i18n/dict";
import { createPlayer, type Player } from "./players";

const GUARD_MS = 1200; // after we move the player ourselves, its own events are not "someone pressed a button"

// "함께 보기". The database holds the one timetable (video, position, playing, revision).
// This screen follows it, and sends a command only when a person on THIS device pressed something.
export function WatchTogether({ roomId, hasPartner, partnerName }: { roomId: string; hasPartner: boolean; partnerName: string }) {
  const { t } = useT();
  const [ws, setWs] = useState<WatchState | null>(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [playerMsg, setPlayerMsg] = useState<MessageKey | "">("");
  const [apiFailed, setApiFailed] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [clock, setClock] = useState(0);
  const [busy, setBusy] = useState(false);

  const supabaseRef = useRef<ReturnType<typeof browserClient>>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const readyRef = useRef(false);
  const wsRef = useRef<WatchState | null>(null);
  const offsetRef = useRef(0);
  const lastRevRef = useRef(0);
  const mineRef = useRef<Set<number>>(new Set());
  const firstRef = useRef(true);
  const loadedRef = useRef<string | null>(null);
  const guardUntil = useRef(0);
  const lastCorrection = useRef(0);
  const bufferingRef = useRef(false);
  const lastPoll = useRef<{ t: number; at: number; playing: boolean } | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const timers = useRef<{ pause?: ReturnType<typeof setTimeout>; seek?: ReturnType<typeof setTimeout>; autoplay?: ReturnType<typeof setTimeout> }>({});

  const videoId = ws?.videoId ?? null;
  const source: VideoSource = ws?.source ?? "youtube";
  // What is loaded is identified by source + id, so a YouTube id and a file address never collide.
  const videoKey = videoId ? source + ":" + videoId : null;
  const keyOf = (st: WatchState) => (st.videoId ? (st.source ?? "youtube") + ":" + st.videoId : null);

  const guard = () => {
    guardUntil.current = performance.now() + GUARD_MS;
    lastPoll.current = null;
  };
  const guarded = () => performance.now() < guardUntil.current;

  // ---------------------------------------------------------------- following the database
  // Moves the player to where the database says it should be. Used for partner changes and on (re)connect,
  // and never waits for the 3 second cool-down.
  const applyServer = useCallback((s: WatchState) => {
    const p = playerRef.current;
    if (!p || !readyRef.current || !s.videoId) return;
    guard();
    if (p.kind !== (s.source ?? "youtube")) return; // a different kind of player is being made for this video
    const target = targetPosition(s, Date.now(), offsetRef.current);
    const key = keyOf(s);
    if (loadedRef.current !== key) {
      loadedRef.current = key;
      setPlayerMsg("");
      p.load(s.videoId, target);
    } else {
      p.seekTo(target);
    }
    if (s.playing) {
      p.playVideo();
      clearTimeout(timers.current.autoplay);
      // If the browser refuses to start the video by itself, say so and offer a button (a click is allowed to start it).
      timers.current.autoplay = setTimeout(() => {
        const state = playerRef.current?.getPlayerState();
        if (wsRef.current?.playing && state !== 1 && state !== 3) setBlocked(true);
      }, 1500);
    } else {
      p.pauseVideo();
      setBlocked(false);
    }
    lastCorrection.current = performance.now();
  }, []);

  const refresh = useCallback(
    async (force = false) => {
      const supabase = supabaseRef.current;
      if (!supabase) return;
      const { data } = await supabase.rpc("watch_state", { target: roomId });
      if (!data) return;
      const next = data as WatchState;
      offsetRef.current = clockOffset(next.nowMs, Date.now());
      const kind = classifyRevision(next.revision, lastRevRef.current, next.by, mineRef.current);
      if (next.revision > lastRevRef.current) lastRevRef.current = next.revision;
      wsRef.current = next;
      setWs(next);
      if (force || firstRef.current || kind === "apply") {
        if (next.videoId) firstRef.current = false;
        applyServer(next);
      }
    },
    [roomId, applyServer],
  );

  // ---------------------------------------------------------------- sending what a person did
  const sendCommand = useCallback(
    (kind: "play" | "pause" | "seek", position: number) => {
      const supabase = supabaseRef.current;
      const current = wsRef.current;
      if (!supabase || !current?.videoId) return;
      const pos = Math.max(0, Math.round(position * 1000) / 1000);
      // Show the change at once; the database's answer carries the real revision.
      const local: WatchState = {
        ...current,
        positionSec: pos,
        refMs: Date.now() + offsetRef.current,
        playing: kind === "play" ? true : kind === "pause" ? false : current.playing,
        by: "me",
      };
      wsRef.current = local;
      setWs(local);
      const request = crypto.randomUUID();
      queueRef.current = queueRef.current.then(async () => {
        const { data, error: failure } = await supabase.rpc("watch_command", { target: roomId, kind, pos, request_id: request });
        if (failure) {
          if (!failure.message.includes("Too many commands")) setError(t(roomErrorKey(failure.message)));
          await refresh(true);
          return;
        }
        const revision = Number(data);
        mineRef.current.add(revision);
        if (revision > lastRevRef.current) lastRevRef.current = revision;
        if (wsRef.current) wsRef.current = { ...wsRef.current, revision };
        setError("");
      });
    },
    [roomId, refresh],
  );

  // A person pressed one of OUR buttons.
  const press = (kind: "play" | "pause" | "seek", seekBy = 0) => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    guard();
    const now = p.getCurrentTime();
    if (kind === "play") {
      p.playVideo();
      setBlocked(false);
      sendCommand("play", now);
    } else if (kind === "pause") {
      p.pauseVideo();
      sendCommand("pause", now);
    } else {
      const to = Math.max(0, now + seekBy);
      p.seekTo(to);
      sendCommand("seek", to);
    }
  };

  // ---------------------------------------------------------------- connection: signals, heartbeat, leaving
  useEffect(() => {
    const supabase = browserClient();
    supabaseRef.current = supabase;
    if (!supabase) return;
    let active = true;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    const reread = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => refresh(), 100);
    };
    const ping = async () => {
      const { error: failure } = await supabase.rpc("watch_ping", { target: roomId });
      if (failure) setError(t(roomErrorKey(failure.message)));
    };
    const leave = () => {
      void supabase.rpc("watch_leave", { target: roomId }).then(() => undefined);
    };
    (async () => {
      await ping();
      if (!active) return;
      await supabase.realtime.setAuth();
      if (!active) return;
      channel = supabase
        .channel("room:" + roomId, { config: { private: true } })
        .on("broadcast", { event: "watch" }, reread)
        .on("broadcast", { event: "members" }, () => window.location.reload())
        .subscribe((status) => {
          document.documentElement.dataset.roomLive = status === "SUBSCRIBED" ? "on" : "off";
          if (status === "SUBSCRIBED") reread();
        });
      refresh();
    })();
    // Heartbeat: tells the database I am still here, and re-reads in case a signal was missed.
    const beat = setInterval(() => {
      ping();
      refresh();
    }, 20_000);
    const visible = () => {
      if (document.visibilityState === "visible") {
        ping();
        refresh();
      }
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pagehide", leave);
    return () => {
      active = false;
      clearTimeout(debounce);
      clearInterval(beat);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("pagehide", leave);
      if (channel) supabase.removeChannel(channel);
      leave();
    };
  }, [roomId, refresh]);

  // ---------------------------------------------------------------- the player
  useEffect(() => {
    if (!videoKey || !videoId) return;
    let cancelled = false;
    const existing = playerRef.current;
    if (existing && existing.kind === source) {
      // Same kind of player, new video: keep the one player and load into it.
      if (readyRef.current && wsRef.current && loadedRef.current !== videoKey) applyServer(wsRef.current);
      return;
    }
    if (existing) {
      existing.destroy();
      playerRef.current = null;
      readyRef.current = false;
      setPlayerReady(false);
    }
    const host = hostRef.current;
    if (!host) return;
    const wanted = videoKey;
    createPlayer(source, host, videoId, {
      onReady: () => {
        if (cancelled) return;
        readyRef.current = true;
        loadedRef.current = wanted;
        setPlayerReady(true);
        if (wsRef.current) {
          // The player was made with this video; if the room's video changed meanwhile, switch to it.
          if (keyOf(wsRef.current) !== wanted) loadedRef.current = null;
          applyServer(wsRef.current);
        }
      },
      onState: (code) => {
        const pl = playerRef.current;
        if (!pl) return;
        bufferingRef.current = code === 3;
        if (code === 1) {
          setBlocked(false);
          // Someone pressed play on the video itself while the room is paused.
          if (!guarded() && wsRef.current && !wsRef.current.playing) sendCommand("play", pl.getCurrentTime());
        }
        if ((code === 2 || code === 0) && !guarded() && wsRef.current?.playing) {
          // A pause is checked again after a moment: seeking can flicker through "paused".
          clearTimeout(timers.current.pause);
          timers.current.pause = setTimeout(() => {
            const state = playerRef.current?.getPlayerState();
            if (!guarded() && wsRef.current?.playing && (state === 2 || state === 0)) sendCommand("pause", playerRef.current?.getCurrentTime() ?? 0);
          }, 350);
        }
      },
      onError: (key) => setPlayerMsg(key),
      onAutoplayBlocked: () => setBlocked(true),
    }).then(
      (made) => {
        if (cancelled) made.destroy();
        else playerRef.current = made;
      },
      () => {
        if (!cancelled) setApiFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoKey, source, applyServer, sendCommand]);

  // Keyboard: ← / → move 10 seconds for both (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (!readyRef.current || !wsRef.current?.videoId) return;
      e.preventDefault();
      press("seek", e.key === "ArrowLeft" ? -10 : 10);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Twice a second: show the time, notice a seek made on the video itself, and every 2 s check the drift.
  useEffect(() => {
    let tick = 0;
    const timer = setInterval(() => {
      const p = playerRef.current;
      const s = wsRef.current;
      if (!p || !readyRef.current || !s?.videoId) return;
      const now = performance.now();
      const cur = p.getCurrentTime();
      const state = p.getPlayerState();
      setClock(cur);
      if (now < guardUntil.current) {
        lastPoll.current = null;
        return;
      }
      const lp = lastPoll.current;
      if (lp) {
        const expected = lp.t + (lp.playing ? (now - lp.at) / 1000 : 0);
        if (Math.abs(cur - expected) > 2) {
          clearTimeout(timers.current.seek);
          timers.current.seek = setTimeout(() => {
            if (!guarded() && playerRef.current) sendCommand("seek", playerRef.current.getCurrentTime());
          }, 300);
        }
      }
      lastPoll.current = { t: cur, at: now, playing: state === 1 };
      tick += 1;
      if (tick % 4 === 0 && state === 1 && shouldCheckDrift(s, bufferingRef.current)) {
        const remote = targetPosition(s, Date.now(), offsetRef.current);
        if (shouldCorrectDrift(remote, cur, now - lastCorrection.current)) {
          guard();
          p.seekTo(remote);
          lastCorrection.current = now;
        }
      }
    }, 500);
    return () => clearInterval(timer);
  }, [sendCommand]);

  // ---------------------------------------------------------------- forms
  async function submitLink(event: FormEvent) {
    event.preventDefault();
    const supabase = supabaseRef.current;
    if (!supabase || busy) return;
    if (!parseVideo(link)) {
      setError(t("err.videoLink"));
      return;
    }
    setBusy(true);
    setError("");
    const { error: failure } = await supabase.rpc("watch_set_video", { target: roomId, link });
    setBusy(false);
    if (failure) {
      setError(t(roomErrorKey(failure.message)));
      return;
    }
    setLink("");
    setPlayerMsg("");
    await refresh(true);
  }

  async function setReady(value: boolean) {
    const supabase = supabaseRef.current;
    if (!supabase || busy) return;
    setBusy(true);
    const { error: failure } = await supabase.rpc("watch_ready", { target: roomId, is_ready: value });
    setBusy(false);
    setError(failure ? t(roomErrorKey(failure.message)) : "");
    await refresh();
  }

  // ---------------------------------------------------------------- what the screen says
  const mode = !ws?.videoId ? "idle" : ws.playing ? "playing" : "paused";
  const partnerLine = !hasPartner
    ? t("watch.noPartner")
    : !ws?.partnerHere
      ? t("watch.partnerAway", { name: partnerName })
      : ws.partnerReady
        ? t("watch.partnerReady", { name: partnerName })
        : t("watch.partnerHere", { name: partnerName });
  const canReady = Boolean(ws?.videoId) && playerReady && !playerMsg && !busy;

  return (
    <div className="watch" data-watch={mode} data-revision={ws?.revision ?? 0} data-source={source}>
      <section className="sheet watch-pick" aria-label={t("watch.pick")}>
        <h2>{t("watch.pickTitle")}</h2>
        <form className="chat-form" onSubmit={submitLink}>
          <label className="visually-hidden" htmlFor="watch-link">{t("watch.linkLabel")}</label>
          <input id="watch-link" name="link" inputMode="url" autoComplete="off" placeholder={t("watch.linkPlaceholder")} value={link} onChange={(e) => setLink(e.target.value)} />
          <button type="submit" className="button" disabled={busy || link.trim() === ""}>{t("watch.set")}</button>
        </form>
        <p className="hint">{t("watch.linkHint")}</p>
      </section>

      <section className="sheet watch-stage" aria-label={t("watch.stage")}>
        <div className="watch-frame" data-empty={!videoId}>
          <div ref={hostRef} className="watch-host" />
          {!videoId && <p className="watch-empty">{t("watch.empty")}</p>}
        </div>
        {videoId && (
          <div className="watch-bar" role="group" aria-label={t("watch.bar")}>
            <button type="button" className="button ghost" aria-label={t("watch.back10Label")} disabled={!playerReady} onClick={() => press("seek", -10)}>{t("watch.back10")}</button>
            <button type="button" className="button" disabled={!playerReady || mode === "playing"} onClick={() => press("play")}>{t("watch.play")}</button>
            <button type="button" className="button" disabled={!playerReady || mode !== "playing"} onClick={() => press("pause")}>{t("watch.pause")}</button>
            <button type="button" className="button ghost" aria-label={t("watch.fwd10Label")} disabled={!playerReady} onClick={() => press("seek", 10)}>{t("watch.fwd10")}</button>
            <p className="watch-clock" role="timer" aria-label={t("watch.position")}>{formatClock(clock)}</p>
          </div>
        )}
        {videoId && <p className="hint">{t("watch.keys")}</p>}
        {apiFailed && <p role="alert" className="error">{t("watch.apiFailed")}</p>}
        {playerMsg && (
          <p role="alert" className="error">
            {t(playerMsg)}{" "}
            {videoId && <a href={videoPage(source, videoId)} target="_blank" rel="noopener noreferrer">{t("watch.openOriginal")}</a>}
          </p>
        )}
        {blocked && !playerMsg && (
          <div className="watch-blocked" role="status">
            <p>{t("watch.blocked", { name: partnerName })}</p>
            <button
              type="button"
              className="button"
              onClick={() => {
                const st = wsRef.current;
                const p = playerRef.current;
                if (!st || !p) return;
                guard();
                p.seekTo(targetPosition(st, Date.now(), offsetRef.current));
                p.playVideo();
                setBlocked(false);
              }}
            >
              {t("watch.blockedButton")}
            </button>
          </div>
        )}
      </section>

      {videoId && (
        <section className="sheet watch-controls" aria-label={t("watch.controls")}>
          <p className="waiting" aria-live="polite">{partnerLine}</p>
          {ws && !ws.playing && ws.positionSec > 0 && <p className="hint">{t("watch.resume", { t: formatClock(ws.positionSec) })}</p>}
          <div className="draw-actions">
            <button type="button" className="button" disabled={!canReady || (ws?.meReady ?? false)} onClick={() => setReady(true)}>
              {ws?.meReady ? t("watch.readyDone") : t("watch.ready")}
            </button>
            {ws?.meReady && <button type="button" className="button ghost" disabled={busy} onClick={() => setReady(false)}>{t("watch.readyCancel")}</button>}
          </div>
          <p className="hint">{t("watch.readyHint")}</p>
        </section>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
