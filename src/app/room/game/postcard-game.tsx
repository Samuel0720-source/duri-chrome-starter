"use client";

import { useEffect, useState } from "react";
import { postcardBoard } from "../../../core/postcards";
import { useT } from "../../../i18n/client";
import { browserClient } from "../../../lib/supabase/browser";

export function PostcardGame({ day, roomId }: { day: string; roomId: string }) {
  const { t } = useT();
  const board = postcardBoard(day);
  const [open, setOpen] = useState<number[]>([]);
  const [found, setFound] = useState<number[]>([]);
  const [turns, setTurns] = useState(0);
  const [share, setShare] = useState<"ready" | "sending" | "sent" | "error">("ready");
  const [request, setRequest] = useState<string | null>(null);
  const done = found.length === board.length;
  useEffect(() => {
    if (open.length !== 2) return;
    const timer = window.setTimeout(() => setOpen([]), 900);
    return () => window.clearTimeout(timer);
  }, [open]);
  function flip(i: number) {
    if (open.length === 2 || open.includes(i) || found.includes(i)) return;
    if (open.length === 0) return setOpen([i]);
    const pair = [open[0], i];
    setTurns(old => old + 1);
    if (board[pair[0]] === board[i]) {
      setFound(old => [...old, ...pair]);
      setOpen([]);
    } else setOpen(pair);
  }
  async function shareResult() {
    const id = request ?? crypto.randomUUID();
    setRequest(id);
    setShare("sending");
    try {
      const client = browserClient();
      if (!client) throw new Error();
      const { error } = await client.rpc("send_room_message", {
        target: roomId, request: id, message: t("post.score", { day, n: turns }),
      });
      setShare(error ? "error" : "sent");
    } catch { setShare("error"); }
  }
  return <section className="post-game">
    <img src="/icons/postbirds.webp" alt="" width="126" height="84" />
    <h2>{t("game.post")}</h2>
    <p>{t("post.rules")}</p>
    <p className="post-count" role="status">{t("post.count", { n: turns, pairs: found.length / 2 })}</p>
    <div className="post-board">
      {board.map((face, i) => {
        const matched = found.includes(i);
        const visible = matched || open.includes(i);
        return <button key={i} type="button" data-found={matched} aria-disabled={matched || open.includes(i) || open.length === 2}
          aria-label={t(visible ? "post.face" : "post.back", { n: i + 1, face })}
          onClick={() => flip(i)}>{visible ? face : "✉"}</button>;
      })}
    </div>
    {done && <div className="actions">
      <button className="button" onClick={shareResult} disabled={share === "sending" || share === "sent"}>{t(share === "sent" ? "post.sent" : "post.share")}</button>
      <a className="nav-link" href="/room/chat">{t("tabs.chat")}</a>
      {share === "error" && <p role="alert">{t("common.saveFailed")}</p>}
    </div>}
  </section>;
}
