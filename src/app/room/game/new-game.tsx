"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { callClient } from "../../../lib/supabase/browser";
import { useT } from "../../../i18n/client";
type Request = {
  id: string | null;
  mine?: boolean;
  stackBB?: number;
  status?: string;
  active?: boolean;
};
// Own socket: sharing the screen's channel would remove its listeners on unmount.
export function NewGame({
  roomId,
  kind,
  partnerName,
}: {
  roomId: string;
  kind: string;
  partnerName: string;
}) {
  const { t } = useT();
  const [request, setRequest] = useState<Request>({ id: null });
  const [bb, setBB] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const client = useRef<ReturnType<typeof callClient>>(null);
  const applied = useRef<string | null>(null);
  const receive = useCallback((r: Request) => {
    setRequest(r);
    if (r.status === "accepted" && r.id !== applied.current) {
      applied.current = r.id;
      window.dispatchEvent(new Event("duri-new-game"));
    }
  }, []);
  const refresh = useCallback(async () => {
    try {
      const r = await client.current?.rpc("game_request_state", {
        target: roomId,
        game_kind: kind,
      });
      if (r?.error) throw r.error;
      if (r?.data) {
        receive(r.data);
        setError(false);
      }
    } catch {
      setError(true);
    }
  }, [roomId, kind, receive]);
  useEffect(() => {
    const c = callClient();
    client.current = c;
    if (!c) return;
    let live = true;
    const channel = c
      .channel("room:" + roomId, { config: { private: true } })
      .on("broadcast", { event: "rematch" }, () => void refresh())
      .subscribe((s) => {
        if (live && s === "SUBSCRIBED") void refresh();
      });
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 4000);
    return () => {
      live = false;
      clearInterval(timer);
      void c.removeChannel(channel);
      void c.realtime.disconnect();
      client.current = null;
    };
  }, [roomId, refresh]);
  async function send(accept?: boolean) {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const r =
        accept === undefined
          ? await client.current?.rpc("request_new_game", {
              target: roomId,
              game_kind: kind,
              stack_bb: bb,
            })
          : await client.current?.rpc("respond_new_game", {
              target: roomId,
              game_kind: kind,
              request_id: request.id,
              accept,
            });
      if (!r || r.error) throw r?.error;
      if (r.data) receive(r.data);
    } catch {
      setError(true);
      void refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="new-game" aria-label={t("match.new")}>
      {kind === "poker" && (
        <>
          <label>
            {t("poker.startStack")}
            <select
              aria-label={t("poker.startStack")}
              value={bb}
              disabled={busy || request.active}
              onChange={(e) => setBB(Number(e.target.value))}
            >
              {[50, 75, 100].map((n) => (
                <option key={n} value={n}>
                  {n} BB · {n * 2} {t("poker.chips")}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">{t("poker.depth")}</p>
        </>
      )}
      {request.active ? (
        <>
          <p role="status">
            {t(request.mine ? "match.wait" : "match.invite", {
              name: partnerName,
            })}
            {kind === "poker" && ` · ${request.stackBB} BB ${t("poker.each")}`}
          </p>
          <div className="actions">
            {!request.mine && (
              <button
                className="button"
                disabled={busy}
                onClick={() => send(true)}
              >
                {t("match.accept")}
              </button>
            )}
            <button
              className="button ghost"
              disabled={busy}
              onClick={() => send(false)}
            >
              {t(request.mine ? "match.cancel" : "match.decline")}
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            className="button ghost"
            disabled={busy}
            onClick={() => send()}
          >
            {t(kind === "poker" ? "poker.invite" : "match.new")}
          </button>
          <span className="hint">{t("match.note")}</span>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {t("match.error")}
        </p>
      )}
    </section>
  );
}
// Re-read on accepted rematches, including when the realtime message was missed.
export function useNewGameRefresh(refresh: () => unknown) {
  useEffect(() => {
    const read = () => void refresh();
    window.addEventListener("duri-new-game", read);
    return () => window.removeEventListener("duri-new-game", read);
  }, [refresh]);
}
