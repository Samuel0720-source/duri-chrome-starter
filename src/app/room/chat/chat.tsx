"use client";

import { useRoomChannel } from "../use-room-channel";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "../../../lib/supabase/browser";
import { roomErrorKey } from "../../../core/auth-paths";
import { ago, lastMineId, seenStatus, startsGroup } from "../../../core/chat";
import { useT } from "../../../i18n/client";


export type Message = { id: number; sender: string | null; body: string; created_at: string };
type Shown = Message & { state?: "sending" | "failed"; request?: string };

// Saved messages in id order, then this device's unsent ones (negative ids) in the order typed.
function order(list: Shown[]): Shown[] {
  return [...list.filter((m) => m.id > 0).sort((a, b) => a.id - b.id), ...list.filter((m) => m.id < 0)];
}

// Live chat for the two partners. New messages arrive over the room's private channel
// as a signal; the list then reads only rows after the last one it has.
export type ReadMark = { upto: number; atMs: number | null };

export function Chat({ roomId, me, zone, initial, prompt, partnerName, initialPartnerRead, initialMyRead }: {
  prompt: string; roomId: string; me: string; zone: string; initial: Message[]; partnerName: string; initialPartnerRead: ReadMark; initialMyRead: number;
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const roomChannel = useRoomChannel(roomId);
  const [messages, setMessages] = useState<Shown[]>(initial);
  const [partnerRead, setPartnerRead] = useState<ReadMark>(initialPartnerRead);
  const [now, setNow] = useState(() => Date.now());
  const myReadRef = useRef(initialMyRead);
  const [text, setText] = useState("");
  const [question, setQuestion] = useState(prompt);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const followLatest = useRef(true);
  const supabaseRef = useRef<ReturnType<typeof browserClient>>(null);
  const lastId = useRef(initial.at(-1)?.id ?? 0);

  const merge = useCallback((rows: Message[]) => {
    if (rows.length === 0) return;
    // Read the current position before changing the list. A scroll event can still
    // be queued when a realtime reply arrives in the same animation frame.
    const list = listRef.current;
    if (list) followLatest.current = list.scrollHeight - list.scrollTop - list.clientHeight < 64;
    lastId.current = Math.max(lastId.current, ...rows.map((r) => r.id));
    setMessages((old) => {
      const known = new Set(old.filter((m) => m.id > 0).map((m) => m.id));
      return order([...old, ...rows.filter((r) => !known.has(r.id))]);
    });
  }, []);

  const pull = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const { data } = await supabase
      .from("room_messages").select("id, sender, body, created_at")
      .eq("room_id", roomId).gt("id", lastId.current).order("id").limit(100);
    merge(data ?? []);
  }, [roomId, merge]);

  const loadPartnerRead = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const { data } = await supabase.from("member_prefs").select("user_id, read_upto, read_at").eq("room_id", roomId).neq("user_id", me).maybeSingle();
    if (data) setPartnerRead({ upto: Number(data.read_upto), atMs: data.read_at ? Date.parse(data.read_at) : null });
    setNow(Date.now());
  }, [roomId, me]);

  const reload = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const { data } = await supabase
      .from("room_messages").select("id, sender, body, created_at")
      .eq("room_id", roomId).order("id", { ascending: false }).limit(50);
    const rows = (data ?? []).reverse();
    lastId.current = rows.at(-1)?.id ?? 0;
    setMessages((old) => [...rows, ...old.filter((m) => m.id < 0)]);
  }, [roomId]);

  useEffect(() => {
    const supabase = browserClient();
    supabaseRef.current = supabase;
    if (!supabase) return;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    (async () => {
      await supabase.realtime.setAuth();
      if (!active) return;
      channel = roomChannel(supabase)
        .on("broadcast", { event: "messages" }, ({ payload }) => (payload?.change === "delete" ? reload() : pull()))
        .on("broadcast", { event: "prefs" }, () => loadPartnerRead())
        .on("broadcast", { event: "members" }, () => router.refresh())
        .subscribe((status) => {
          if (!active) return;
          document.documentElement.dataset.roomLive = status === "SUBSCRIBED" ? "on" : "off";
          // After a reconnect, catch up on anything missed while offline.
          if (status === "SUBSCRIBED") { pull(); loadPartnerRead(); }
        });
    })();
    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomChannel, roomId, me, pull, reload, loadPartnerRead, router]);

  // Tell the database how far I have read, but only while this screen is really in front of me.
  const markRead = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase || document.visibilityState !== "visible" || !document.hasFocus()) return;
    const upto = lastId.current;
    if (upto <= myReadRef.current) return;
    myReadRef.current = upto;
    const { error: failure } = await supabase.rpc("mark_chat_read", { target: roomId, upto });
    if (failure) myReadRef.current = 0;
  }, [roomId]);
  useEffect(() => {
    const id = setTimeout(() => void markRead(), 400);
    return () => clearTimeout(id);
  }, [messages, markRead]);
  useEffect(() => {
    const again = () => void markRead();
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("focus", again);
      clearInterval(tick);
    };
  }, [markRead]);

  useEffect(() => {
    const list = listRef.current;
    if (list && followLatest.current) list.scrollTo({
      top: list.scrollHeight,
      behavior: "instant",
    });
  }, [messages.length]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => {
      if (followLatest.current) list.scrollTo({ top: list.scrollHeight, behavior: "instant" });
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  async function deliver(request: string, body: string, tempId: number) {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const { data, error: failure } = await supabase.rpc("send_room_message", { target: roomId, request, message: body });
    if (failure || typeof data !== "number") {
      setError(t(roomErrorKey(failure?.message)));
      setMessages((old) => old.map((m) => (m.id === tempId ? { ...m, state: "failed" } : m)));
      return;
    }
    setError("");
    setMessages((old) => {
      const without = old.filter((m) => m.id !== tempId && m.id !== data);
      return order([...without, { id: data, sender: me, body, created_at: new Date().toISOString() }]);
    });
    lastId.current = Math.max(lastId.current, data);
  }

  function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    followLatest.current = true;
    const body = question ? question + "\n" + text.trim() : text.trim();
    setQuestion("");
    const request = crypto.randomUUID();
    const tempId = -Date.now();
    setMessages((old) => [...old, { id: tempId, sender: me, body, created_at: new Date().toISOString(), state: "sending", request }]);
    setText("");
    deliver(request, body, tempId);
  }

  function retry(m: Shown) {
    if (!m.request) return;
    setMessages((old) => old.map((x) => (x.id === m.id ? { ...x, state: "sending" } : x)));
    deliver(m.request, m.body, m.id);
  }

  async function remove(id: number) {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const { error: failure } = await supabase.rpc("delete_my_message", { message_id: id });
    if (failure) setError(t(roomErrorKey(failure.message)));
    else setMessages((old) => old.filter((m) => m.id !== id));
  }

  const time = new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-CA", { timeZone: zone, hour: "numeric", minute: "2-digit" });
  const mineLast = lastMineId(messages, me);
  const seen = seenStatus(mineLast, partnerRead.upto);
  const when = partnerRead.atMs ? ago(now, partnerRead.atMs) : { key: "rel.now" as const, n: 0 };

  return (
    <>
    <div className="chat">
      <ol className="chat-list" ref={listRef} tabIndex={0} onScroll={() => {
        const list = listRef.current;
        if (list) followLatest.current = list.scrollHeight - list.scrollTop - list.clientHeight < 64;
      }} aria-label={t("chat.list")} aria-live="polite">
        {messages.length === 0 && <li className="chat-empty">{t("chat.empty")}</li>}
        {messages.map((m, i) => (
          <li key={m.id} className={m.sender === me ? "mine" : "theirs"} data-state={m.state}>
            {m.sender !== me && startsGroup(messages, i) && <span className="chat-name">{partnerName}</span>}
            <p className="bubble">{m.body}</p>
            <span className="chat-meta">
              {m.state === "sending" ? t("chat.sending") : m.state === "failed" ? t("chat.failed") : time.format(new Date(m.created_at))}
              {m.state === "failed" && (
                <button type="button" className="chat-action" onClick={() => retry(m)}>{t("chat.retry")}</button>
              )}
              {m.sender === me && !m.state && m.id > 0 && (
                <button type="button" className="chat-action" onClick={() => remove(m.id)} aria-label={t("chat.removeLabel")}>{t("chat.remove")}</button>
              )}
            </span>
            {m.id === mineLast && seen !== "none" && (
              <span className="chat-seen" data-testid="chat-seen" data-seen={seen}>
                {seen === "seen" ? t("chat.seen", { when: t(when.key, { n: when.n }) }) : t("chat.unseen")}
              </span>
            )}
          </li>
        ))}
      </ol>
      {question && <aside className="draft-question"><strong>{question}</strong> <button type="button" onClick={() => setQuestion("")}>{t("post.dismiss")}</button></aside>}
      <form className="chat-form" onSubmit={send}>
        <label htmlFor="chat-input" className="visually-hidden">{t("chat.input")}</label>
        <input
          id="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault(); }}
          maxLength={1000 - (question ? question.length + 1 : 0)}
          autoComplete="off"
          placeholder={t("chat.placeholder")}
        />
        <button type="submit" disabled={!text.trim()}>{t("chat.send")}</button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
    </>
  );
}
