"use client";

import { useActionState, useState } from "react";
import { issueInvite, type InviteState } from "./actions";

export function InviteBox({ roomId }: { roomId: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(issueInvite, {});
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="room" value={roomId} />
      <button type="submit" disabled={pending}>{pending ? "만드는 중…" : state.link ? "새 초대 링크 만들기" : "초대 링크 만들기"}</button>
      {state.link && (
        <>
          <label htmlFor="invite-link">초대 링크</label>
          <input id="invite-link" readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="secondary"
            onClick={() => navigator.clipboard.writeText(state.link!).then(() => setCopied(true), () => setCopied(false))}
          >
            {copied ? "복사했어요" : "링크 복사"}
          </button>
          <p className="hint">48시간 동안 한 번만 쓸 수 있어요. 새로 만들면 이전 링크는 사라져요.</p>
        </>
      )}
      {state.error && <p role="alert" className="error">{state.error}</p>}
    </form>
  );
}
