"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { browserClient } from "../../../lib/supabase/browser";
import { roomErrorMessage } from "../../../core/auth-paths";
import { clockOffset } from "../../../core/draw";
import {
  classifyRevision, formatClock, parseYouTube, playerErrorMessage, shouldCheckDrift, shouldCorrectDrift, targetPosition,
  type WatchState,
} from "../../../core/watch";

// The small part of the official YouTube IFrame Player API this screen uses.
type YTPlayer = {
  getCurrentTime(): number;
  getPlayerState(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
};
type YTEvent = { data: number };
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, options: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadYouTubeApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve();
    const earlier = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      earlier?.();
      resolve();
    };
    if (!document.querySelector("script[data-youtube-api]")) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.dataset.youtubeApi = "1";
      script.onerror = () => reject(new Error("youtube api"));
      document.head.appendChild(script);
    }
  });
}

const GUARD_MS = 1200; // after we move the player ourselves, its own events are not "someone pressed a button"

// "함께 보기". The database holds the one timetable (video, position, playing, revision).
// This screen follows it, and sends a command only when a person on THIS device pressed something.
export function WatchTogether({ roomId, hasPartner }: { roomId: string; hasPartner: boolean }) {
  const [ws, setWs] = useState<WatchState | null>(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [playerMsg, setPlayerMsg] = useState("");
  const [apiFailed, setApiFailed] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [clock, setClock] = useState(0);
  const [busy, setBusy] = useState(false);

  const supabaseRef = useRef<ReturnType<typeof browserClient>>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
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
    const target = targetPosition(s, Date.now(), offsetRef.current);
    if (loadedRef.current !== s.videoId) {
      loadedRef.current = s.videoId;
      setPlayerMsg("");
      p.cueVideoById({ videoId: s.videoId, startSeconds: target });
    } else {
      p.seekTo(target, true);
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
          if (!failure.message.includes("Too many commands")) setError(roomErrorMessage(failure.message));
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
      p.seekTo(to, true);
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
      if (failure) setError(roomErrorMessage(failure.message));
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
    if (!videoId) return;
    let cancelled = false;
    const wanted = videoId;
    loadYouTubeApi().then(
      () => {
        if (cancelled) return;
        if (playerRef.current) {
          // Same player, new video: the page keeps one iframe.
          if (readyRef.current && wsRef.current && loadedRef.current !== wanted) applyServer(wsRef.current);
          return;
        }
        const host = hostRef.current;
        if (!host || !window.YT) return;
        const slot = document.createElement("div");
        host.replaceChildren(slot);
        playerRef.current = new window.YT.Player(slot, {
          videoId: wanted,
          playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: () => {
              readyRef.current = true;
              loadedRef.current = wanted;
              setPlayerReady(true);
              if (wsRef.current) {
                // The player was created with the first video; if the video changed meanwhile, switch to it.
                if (wsRef.current.videoId !== wanted) loadedRef.current = null;
                applyServer(wsRef.current);
              }
            },
            onStateChange: (e: YTEvent) => {
              const p = playerRef.current;
              if (!p) return;
              if (e.data === 3) bufferingRef.current = true;
              else bufferingRef.current = false;
              if (e.data === 1) {
                setBlocked(false);
                // Someone pressed play on the video itself while the room is paused.
                if (!guarded() && wsRef.current && !wsRef.current.playing) sendCommand("play", p.getCurrentTime());
              }
              if ((e.data === 2 || e.data === 0) && !guarded() && wsRef.current?.playing) {
                // A pause is checked again after a moment: seeking can flicker through "paused".
                clearTimeout(timers.current.pause);
                timers.current.pause = setTimeout(() => {
                  const state = playerRef.current?.getPlayerState();
                  if (!guarded() && wsRef.current?.playing && (state === 2 || state === 0)) sendCommand("pause", playerRef.current?.getCurrentTime() ?? 0);
                }, 350);
              }
            },
            onError: (e: YTEvent) => setPlayerMsg(playerErrorMessage(e.data)),
            onAutoplayBlocked: () => setBlocked(true),
          },
        });
      },
      () => {
        if (!cancelled) setApiFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [videoId, applyServer, sendCommand]);

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
          p.seekTo(remote, true);
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
    if (!parseYouTube(link)) {
      setError("유튜브 링크가 아닌 것 같아요. 예: https://youtu.be/영상번호");
      return;
    }
    setBusy(true);
    setError("");
    const { error: failure } = await supabase.rpc("watch_set_video", { target: roomId, link });
    setBusy(false);
    if (failure) {
      setError(roomErrorMessage(failure.message));
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
    setError(failure ? roomErrorMessage(failure.message) : "");
    await refresh();
  }

  // ---------------------------------------------------------------- what the screen says
  const mode = !ws?.videoId ? "idle" : ws.playing ? "playing" : "paused";
  const partnerLine = !hasPartner
    ? "상대가 방에 들어오면 같이 볼 수 있어요."
    : !ws?.partnerHere
      ? "상대는 아직 이 화면에 오지 않았어요. 오면 이어서 같이 볼 수 있어요."
      : ws.partnerReady
        ? "상대도 준비했어요."
        : "상대가 와 있어요. 아직 준비 전이에요.";
  const canReady = Boolean(ws?.videoId) && playerReady && !playerMsg && !busy;

  return (
    <div className="watch" data-watch={mode} data-revision={ws?.revision ?? 0}>
      <section className="sheet watch-pick" aria-label="영상 고르기">
        <h2>같이 볼 영상</h2>
        <form className="chat-form" onSubmit={submitLink}>
          <label className="visually-hidden" htmlFor="watch-link">유튜브 링크</label>
          <input id="watch-link" name="link" inputMode="url" autoComplete="off" placeholder="유튜브 링크를 붙여 넣어 주세요" value={link} onChange={(e) => setLink(e.target.value)} />
          <button type="submit" className="button" disabled={busy || link.trim() === ""}>영상 정하기</button>
        </form>
        <p className="hint">공유 링크, 쇼츠, 라이브 링크도 돼요. 링크 속 시작 시간은 쓰지 않고 처음부터 시작해요.</p>
      </section>

      <section className="sheet watch-stage" aria-label="영상">
        <div className="watch-frame" data-empty={!videoId}>
          <div ref={hostRef} className="watch-host" />
          {!videoId && <p className="watch-empty">링크를 넣으면 여기에 영상이 나와요.</p>}
        </div>
        {apiFailed && (
          <p role="alert" className="error">유튜브 플레이어를 불러오지 못했어요. 인터넷 연결이나 광고 차단 설정을 확인하고 새로고침해 주세요.</p>
        )}
        {playerMsg && (
          <p role="alert" className="error">
            {playerMsg}{" "}
            {videoId && <a href={"https://www.youtube.com/watch?v=" + videoId} target="_blank" rel="noopener noreferrer">유튜브에서 열기</a>}
          </p>
        )}
        {blocked && !playerMsg && (
          <div className="watch-blocked" role="status">
            <p>브라우저가 자동 재생을 막았어요. 버튼을 누르면 상대와 같은 장면에서 이어져요.</p>
            <button
              type="button"
              className="button"
              onClick={() => {
                const s = wsRef.current;
                const p = playerRef.current;
                if (!s || !p) return;
                guard();
                p.seekTo(targetPosition(s, Date.now(), offsetRef.current), true);
                p.playVideo();
                setBlocked(false);
              }}
            >
              눌러서 같이 보기
            </button>
          </div>
        )}
      </section>

      {videoId && (
        <section className="sheet watch-controls" aria-label="같이 보기 조작">
          <p className="waiting" aria-live="polite">{partnerLine}</p>
          {ws && !ws.playing && ws.positionSec > 0 && <p className="hint">마지막으로 본 곳 {formatClock(ws.positionSec)}에서 이어 봐요.</p>}
          <div className="draw-actions">
            <button type="button" className="button" disabled={!canReady || (ws?.meReady ?? false)} onClick={() => setReady(true)}>
              {ws?.meReady ? "준비 완료" : "준비됐어요"}
            </button>
            {ws?.meReady && <button type="button" className="button ghost" disabled={busy} onClick={() => setReady(false)}>준비 취소</button>}
          </div>
          <p className="hint">둘 다 준비를 누르면 같은 순간에 시작돼요. 시작한 뒤에는 누구든 재생·멈춤·이동을 누르면 둘 다 따라가요.</p>
          <div className="watch-buttons" role="group" aria-label="같이 조작">
            <button type="button" className="button ghost" disabled={!playerReady} onClick={() => press("seek", -10)}>−10초</button>
            <button type="button" className="button" disabled={!playerReady || mode === "playing"} onClick={() => press("play")}>같이 재생</button>
            <button type="button" className="button" disabled={!playerReady || mode !== "playing"} onClick={() => press("pause")}>같이 멈춤</button>
            <button type="button" className="button ghost" disabled={!playerReady} onClick={() => press("seek", 10)}>+10초</button>
          </div>
          <p className="watch-clock" role="timer" aria-label="재생 위치">{formatClock(clock)}</p>
        </section>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
