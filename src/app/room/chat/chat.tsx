"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserClient } from "../../../lib/supabase/browser";
import { roomErrorMessage } from "../../../core/auth-paths";

export type Message = { id: number; sender: string | null; body: string; created_at: string };
type Shown = Message & { state?: "sending" | "failed"; request?: string };

// Saved messages in id order, then this device's unsent ones (negative ids) in the order typed.
function order(list: Shown[]): Shown[] {
  return [...list.filter((m) => m.id > 0).sort((a, b) => a.id - b.id), ...list.filter((m) => m.id < 0)];
}

// Live chat for the two partners. New messages arrive over the room's private channel
// as a signal; the list then reads only rows after the last one it has.
export function Chat({ roomId, me, zone, initial }: { roomId: string; me: string; zone: string; initial: Message[] }) {
  const [messages, setMessages] = useState<Shown[]>(initial);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const supabaseRef = useRef<ReturnType<typeof browserClient>>(null);
  const lastId = useRef(initial.at(-1)?.id ?? 0);

  const merge = useCallback((rows: Message[]) => {
    if (rows.length === 0) return;
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
      channel = supabase
        .channel("room:" + roomId, { config: { private: true } })
        .on("broadcast", { event: "messages" }, ({ payload }) => (payload?.change === "delete" ? reload() : pull()))
        .on("broadcast", { event: "members" }, () => window.location.reload())
        .subscribe((status) => {
          document.documentElement.dataset.roomLive = status === "SUBSCRIBED" ? "on" : "off";
          // After a reconnect, catch up on anything missed while offline.
          if (status === "SUBSCRIBED") pull();
        });
    })();
    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId, pull, reload]);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function deliver(request: string, body: string, tempId: number) {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const { data, error: failure } = await supabase.rpc("send_room_message", { target: roomId, request, message: body });
    if (failure || typeof data !== "number") {
      setError(roomErrorMessage(failure?.message));
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
    const body = text.trim();
    if (!body) return;
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
    if (failure) setError(roomErrorMessage(failure.message));
    else setMessages((old) => old.filter((m) => m.id !== id));
  }

  const time = new Intl.DateTimeFormat("ko-KR", { timeZone: zone, hour: "numeric", minute: "2-digit" });

  return (
    <div className="chat">
      <ol className="chat-list" ref={listRef} aria-label="대화 내용" aria-live="polite">
        {messages.length === 0 && <li className="chat-empty">첫 메시지를 보내 보세요.</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.sender === me ? "mine" : "theirs"} data-state={m.state}>
            <p className="bubble">{m.body}</p>
            <span className="chat-meta">
              {m.state === "sending" ? "보내는 중" : m.state === "failed" ? "보내지 못했어요" : time.format(new Date(m.created_at))}
              {m.state === "failed" && (
                <button type="button" className="chat-action" onClick={() => retry(m)}>다시 보내기</button>
              )}
              {m.sender === me && !m.state && m.id > 0 && (
                <button type="button" className="chat-action" onClick={() => remove(m.id)} aria-label="이 메시지 지우기">지우기</button>
              )}
            </span>
          </li>
        ))}
      </ol>
      <form className="chat-form" onSubmit={send}>
        <label htmlFor="chat-input" className="visually-hidden">메시지</label>
        <input
          id="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          autoComplete="off"
          placeholder="메시지를 입력하세요"
        />
        <button type="submit" disabled={!text.trim()}>보내기</button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
