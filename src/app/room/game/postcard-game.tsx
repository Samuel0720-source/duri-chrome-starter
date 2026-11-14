"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { postcardFaces, type PostcardState } from "../../../core/postcards";
import { useT } from "../../../i18n/client";
import { browserClient } from "../../../lib/supabase/browser";

export function PostcardGame({ roomId, initial, partnerName }: {
  roomId: string; initial: PostcardState | null; partnerName: string;
}) {
  const { t } = useT();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(!initial);
  const [shared, setShared] = useState<number | null>(null);
  const request = useRef<{ revision: number; id: string } | null>(null);
  const accept = useCallback((next: PostcardState) => {
    setState(old => old && (old.revision > next.revision ||
      (old.revision === next.revision && old.revealMs <= next.revealMs)) ? old : next);
  }, []);
  const refresh = useCallback(async () => {
    const result = await browserClient()?.rpc("postcard_state", { target: roomId });
    if (result?.data) { accept(result.data); setFailed(false); }
    else setFailed(true);
  }, [roomId, accept]);
  useEffect(() => {
    const client = browserClient();
    if (!client) return;
    let present = true;
    let channel: ReturnType<typeof client.channel> | undefined;
    void client.realtime.setAuth().then(() => {
      if (!present) return;
      channel = client.channel("room:" + roomId, { config: { private: true } })
        .on("broadcast", { event: "postcards" }, refresh)
        .on("broadcast", { event: "members" }, () => window.location.reload())
        .subscribe(status => { if (status === "SUBSCRIBED") void refresh(); });
    }).catch(() => { if (present) setFailed(true); });
    const poll = window.setInterval(() => { if (!document.hidden) void refresh(); }, 12000);
    window.addEventListener("focus", refresh);
    return () => {
      present = false;
      window.clearInterval(poll);
      window.removeEventListener("focus", refresh);
      if (channel) void client.removeChannel(channel);
    };
  }, [roomId, refresh]);
  useEffect(() => {
    if (!state?.revealMs) return;
    const timer = window.setTimeout(refresh, state.revealMs + 60);
    return () => window.clearTimeout(timer);
  }, [state, refresh]);

  async function move(index?: number) {
    if (busy || !state) return;
    setBusy(true);
    const args = { target: roomId, expected_revision: state.revision };
    try {
      const result = index === undefined
        ? await browserClient()?.rpc("postcard_start", args)
        : await browserClient()?.rpc("postcard_flip", { ...args, card_index: index });
      if (result?.data) { accept(result.data); setFailed(false); }
      else { await refresh(); setFailed(true); }
    } finally { setBusy(false); }
  }
  const mine = state?.scores[state.mySeat - 1] ?? 0;
  const theirs = state?.scores[2 - state.mySeat] ?? 0;
  async function shareScore() {
    if (!state || busy) return;
    setBusy(true);
    if (request.current?.revision !== state.revision) request.current = { revision: state.revision, id: crypto.randomUUID() };
    try {
      const result = await browserClient()?.rpc("send_room_message", {
        target: roomId, request: request.current.id, message: t("post.score", { mine, theirs }),
      });
      if (result && !result.error) { setShared(state.revision); setFailed(false); }
      else setFailed(true);
    } finally { setBusy(false); }
  }
  const myTurn = state?.turnSeat === state?.mySeat;
  const finished = state?.phase === "finished";
  const canFlip = state?.phase === "playing" && myTurn && state.revealMs === 0 && !busy;
  return <section className="post-game" data-phase={state?.phase}>
    <header className="post-heading"><div><h2>{t("game.post")}</h2><p>{t("post.rules")}</p></div>
      <img src="/icons/postbirds.webp" alt="" width="126" height="84" /></header>
    {failed && <p className="error" role="alert">{t("common.saveFailed")} <button onClick={refresh}>{t("post.retry")}</button></p>}
    {state?.phase === "idle" && <button className="button" disabled={busy} onClick={() => move()}>{t("post.start")}</button>}
    {state && state.phase !== "idle" && <>
      <div className="post-scores">
        <div data-current={!finished && myTurn}><span>{t("common.me")}</span><strong>{t("post.points", { n: mine })}</strong></div>
        <div data-current={!finished && !myTurn}><span>{partnerName}</span><strong>{t("post.points", { n: theirs })}</strong></div>
      </div>
      <p className="post-turn" role="status">{finished ? t(mine > theirs ? "post.won" : "post.lost", { name: partnerName })
        : state.revealMs ? t("post.peek") : t(myTurn ? "post.mine" : "post.theirs", { name: partnerName })}</p>
      <div className="post-board">{state.cards.map((face, i) =>
        <button key={i} type="button" disabled={!canFlip || face !== null} data-found={state.owners[i] !== null}
          data-open={face !== null} aria-label={t(face === null ? "post.back" : "post.face", { n: i + 1, face: face === null ? "" : postcardFaces[face] })}
          onClick={() => move(i)}>{face === null ? <span aria-hidden="true">💌</span> : postcardFaces[face]}</button>)}</div>
      {finished && <div className="actions">
        <button className="button" disabled={busy} onClick={() => move()}>{t("post.rematch")}</button>
        <button className="button ghost" disabled={busy || shared === state.revision} onClick={shareScore}>{t(shared === state.revision ? "post.sent" : "post.share")}</button>
        <a className="nav-link" href="/room/chat">{t("tabs.chat")}</a>
      </div>}
    </>}
  </section>;
}
