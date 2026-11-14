"use client";

import { useActionState, useState } from "react";
import { useT } from "../../i18n/client";
import { issueInvite, type InviteState } from "./actions";

export function InviteBox({ roomId }: { roomId: string }) {
  const { t } = useT();
  const [state, action, pending] = useActionState<InviteState, FormData>(issueInvite, {});
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="room" value={roomId} />
      <button type="submit" disabled={pending}>{pending ? t("invite.making") : state.link ? t("invite.new") : t("invite.make")}</button>
      {state.link && (
        <>
          <label htmlFor="invite-link">{t("invite.link")}</label>
          <input id="invite-link" readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} />
          <button
            type="button"
            className="secondary"
            onClick={() => navigator.clipboard.writeText(state.link!).then(() => setCopied(true), () => setCopied(false))}
          >
            {copied ? t("invite.copied") : t("invite.copy")}
          </button>
          <p className="hint">{t("invite.hint")}</p>
        </>
      )}
      {state.error && <p role="alert" className="error">{t(state.error as "err.unknown")}</p>}
    </form>
  );
}
