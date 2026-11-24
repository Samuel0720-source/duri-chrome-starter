"use client";

import { useEffect, useRef, useState } from "react";
import { attachCallAudio } from "./call-audio";
import { useT } from "../../../i18n/client";
import type { CallSession, View } from "./call-session";

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

export function CallControls({ session, view, ready, compact = false }: { compact?: boolean; session: CallSession | null; view: View; ready: boolean }) {
  const { t } = useT();
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
  const [muted, setMuted] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { setMuted(false); setHidden(false); }, [view.local]);
  const audioOnly = view.mode === "audio";
  const remoteAudio = view.remote?.getAudioTracks()[0];
  const remoteVideo = view.remote?.getVideoTracks()[0];
  const localVideo = view.local?.getVideoTracks()[0];
  const status = view.phase === "idle" ? view.note : view.phase === "incoming" ? (audioOnly ? "incomingAudio" : "incomingVideo") : view.phase;
  return <section className="call-box" data-phase={view.phase} data-note={view.note} aria-label={t("call.title")}>
    {popup && view.phase !== "idle" && <p className="mini-call-note">{t("call.keepPopupOpen")}</p>}
    {/* The toolbar popup cannot show Chrome's permission prompt; the extension grants it once in a tab. */}
    {popup && view.phase === "idle" && view.note === "device" && <p className="mini-call-note">{t("call.allowMediaHint")}<br />
      <button type="button" className="button" onClick={() => window.postMessage({ duri: "allow-media" }, location.origin)}>{t("call.allowMedia")}</button></p>}
    <div className="call-top"><div><h2>{t("call.title")}</h2><p role="status">{t(`call.${status}`)}</p>
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
    {compact && !audioOnly && (remoteVideo || localVideo) && <button type="button" className="call-video-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{t(expanded ? "call.hideVideo" : "call.showVideo")}</button>}
    {!audioOnly && (remoteVideo || localVideo) && <div className="call-streams" hidden={compact && !expanded}>
      {remoteVideo && <VideoPreview track={remoteVideo} label={t("call.partner")} />}
      {localVideo && <VideoPreview track={localVideo} label={t("call.self")} />}
    </div>}
    {view.local && <div className="call-actions">
      <button aria-pressed={muted} onClick={() => { view.local?.getAudioTracks().forEach(tr => tr.enabled = muted); setMuted(!muted); }}>{t(muted ? "call.unmute" : "call.mute")}</button>
      {!audioOnly && <button aria-pressed={hidden} onClick={() => { view.local?.getVideoTracks().forEach(tr => tr.enabled = hidden); setHidden(!hidden); }}>{t(hidden ? "call.camOn" : "call.camOff")}</button>}
    </div>}
  </section>;
}
