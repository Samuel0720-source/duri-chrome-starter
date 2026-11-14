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

export function CallControls({ session, view, ready }: { session: CallSession | null; view: View; ready: boolean }) {
  const { t } = useT();
  const [muted, setMuted] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { setMuted(false); setHidden(false); }, [view.local]);
  const audioOnly = view.mode === "audio";
  const remoteAudio = view.remote?.getAudioTracks()[0];
  const remoteVideo = view.remote?.getVideoTracks()[0];
  const localVideo = view.local?.getVideoTracks()[0];
  const status = view.phase === "idle" ? view.note : view.phase === "incoming" ? (audioOnly ? "incomingAudio" : "incomingVideo") : view.phase;
  return <section className="call-box" aria-label={t("call.title")}>
    <div className="call-top"><div><h2>{t("call.title")}</h2><p role="status">{t(`call.${status}`)}</p></div>
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
    {!audioOnly && (remoteVideo || localVideo) && <div className="call-streams">
      {remoteVideo && <VideoPreview track={remoteVideo} label={t("call.partner")} />}
      {localVideo && <VideoPreview track={localVideo} label={t("call.self")} />}
    </div>}
    {view.local && <div className="call-actions">
      <button aria-pressed={muted} onClick={() => { view.local?.getAudioTracks().forEach(tr => tr.enabled = muted); setMuted(!muted); }}>{t(muted ? "call.unmute" : "call.mute")}</button>
      {!audioOnly && <button aria-pressed={hidden} onClick={() => { view.local?.getVideoTracks().forEach(tr => tr.enabled = hidden); setHidden(!hidden); }}>{t(hidden ? "call.camOn" : "call.camOff")}</button>}
    </div>}
  </section>;
}
