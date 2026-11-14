"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "../../../i18n/client";
import type { CallSession, View } from "./call-session";

function StreamPlayer({ stream, local, audioOnly }: { stream: MediaStream; local?: boolean; audioOnly: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  const { t } = useT();
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.srcObject = stream;
    let active = true;
    el.play().catch(() => { if (active) setBlocked(true); });
    return () => { active = false; el.srcObject = null; };
  }, [stream]);
  return <div hidden={audioOnly && !blocked}>
    <video ref={video} autoPlay muted={local} playsInline hidden={audioOnly} aria-label={t(local ? "call.self" : "call.partner")} />
    {blocked && <button className="button" onClick={() => video.current?.play().then(() => setBlocked(false)).catch(() => {})}>{t("call.listen")}</button>}
  </div>;
}
export function CallControls({ session, view, ready }: { session: CallSession | null; view: View; ready: boolean }) {
  const { t } = useT();
  const [muted, setMuted] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { setMuted(false); setHidden(false); }, [view.local]);
  const audioOnly = view.mode === "audio";
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
    {(view.local || view.remote) && <div className="call-streams">
      {view.remote && <StreamPlayer stream={view.remote} audioOnly={audioOnly} />}
      {view.local && !audioOnly && <StreamPlayer stream={view.local} local audioOnly={false} />}
    </div>}
    {view.local && <div className="call-actions">
      <button aria-pressed={muted} onClick={() => { view.local?.getAudioTracks().forEach(tr => tr.enabled = muted); setMuted(!muted); }}>{t(muted ? "call.unmute" : "call.mute")}</button>
      {!audioOnly && <button aria-pressed={hidden} onClick={() => { view.local?.getVideoTracks().forEach(tr => tr.enabled = hidden); setHidden(!hidden); }}>{t(hidden ? "call.camOn" : "call.camOff")}</button>}
    </div>}
  </section>;
}
