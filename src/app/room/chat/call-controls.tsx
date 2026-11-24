"use client";

import { useEffect, useRef, useState } from "react";
import { attachCallAudio } from "./call-audio";
import { useT } from "../../../i18n/client";
import type { CallController, View } from "./call-session";

function PartnerAudio({ track }: { track: MediaStreamTrack }) {
  const audio = useRef<HTMLAudioElement>(null);
  const playback = useRef<ReturnType<typeof attachCallAudio> | null>(null);
  const [blocked, setBlocked] = useState(false);
  const { t } = useT();
  useEffect(() => {
    if (!audio.current) return;
    const player = attachCallAudio(audio.current, track, setBlocked);
    playback.current = player;
    return () => { player.detach(); playback.current = null; };
  }, [track]);
  return <>
    <audio ref={audio} autoPlay />
    {blocked && <button type="button" className="button" onClick={() => playback.current?.play()}>{t("call.listen")}</button>}
  </>;
}

function VideoPreview({ track, label }: { track: MediaStreamTrack; label: string }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = new MediaStream([track]);
    return () => { element.srcObject = null; };
  }, [track]);
  return <div><video ref={video} muted autoPlay playsInline aria-label={label} /></div>;
}

export function CallControls({ session, view, ready, compact = false }: { compact?: boolean; session: CallController | null; view: View; ready: boolean }) {
  const { t, locale } = useT();
  const [popup, setPopup] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setPopup(root.dataset.compact === "popup");
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["data-compact"] });
    return () => observer.disconnect();
  }, []);
  const [expanded, setExpanded] = useState(false);
  const muted = view.muted ?? false;
  const hidden = view.cameraHidden ?? false;
  const audioOnly = view.mode === "audio";
  const remoteAudio = view.remote?.getAudioTracks()[0];
  const remoteVideo = view.remote?.getVideoTracks()[0];
  const localVideo = view.local?.getVideoTracks()[0];
  const status = view.phase === "idle" ? (!ready && view.note === "hint" ? "preparing" : view.note) : view.phase === "incoming" ? (audioOnly ? "incomingAudio" : "incomingVideo") : view.phase;
  return <section className="call-box" data-phase={view.phase} data-note={status} aria-label={t("call.title")}>
    {popup && view.phase !== "idle" && <p className="mini-call-note">{view.background ? t("call.background") : t("call.keepOpen")}</p>}
    <div className="call-top"><div><h2>{t("call.title")}</h2><p role={view.phase === "idle" && !["hint", "ended"].includes(view.note) ? "alert" : "status"}>{t(`call.${status}`)}</p>
      {view.phase === "connected" && view.route && <p className="hint" data-route={view.route}>{t(view.route === "relay" ? "call.route.relay" : "call.route.direct")}</p>}</div>
      <div className="call-actions">
        {view.phase === "idle" ? <>
          <button type="button" disabled={!ready} onClick={() => session?.start("audio")}>{t("call.audio")}</button>
          <button type="button" disabled={!ready} onClick={() => session?.start("video")}>{t("call.video")}</button>
        </> : <>
          {view.phase === "incoming" && <button type="button" onClick={() => session?.accept()}>{t("call.accept")}</button>}
          <button type="button" onClick={() => session?.end()}>{t(view.phase === "incoming" ? "call.decline" : "call.end")}</button>
        </>}
      </div>
    </div>
    {remoteAudio && <PartnerAudio track={remoteAudio} />}
    {view.background && view.audioBlocked && <button type="button" onClick={() => session?.resumeAudio?.()}>{t("call.listen")}</button>}
    {compact && !audioOnly && (remoteVideo || localVideo) && <button type="button" className="call-video-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{locale === "ko" ? (expanded ? "영상 접기" : "영상 보기") : (expanded ? "Hide video" : "Show video")}</button>}
    {!audioOnly && (remoteVideo || localVideo) && <div className="call-streams" hidden={compact && !expanded}>
      {remoteVideo && <VideoPreview track={remoteVideo} label={t("call.partner")} />}
      {localVideo && <VideoPreview track={localVideo} label={t("call.self")} />}
    </div>}
    {(view.local || view.phase === "connected") && <div className="call-actions">
      <button aria-pressed={muted} onClick={() => { session?.setMuted(!muted); }}>{t(muted ? "call.unmute" : "call.mute")}</button>
      {!audioOnly && <button aria-pressed={hidden} onClick={() => { session?.setCameraHidden(!hidden); }}>{t(hidden ? "call.camOn" : "call.camOff")}</button>}
    </div>}
  </section>;
}
