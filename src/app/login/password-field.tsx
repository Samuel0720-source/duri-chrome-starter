"use client";

import { useState } from "react";
import { useT } from "../../i18n/client";

// A password box with a "보기/숨기기" switch, so people can check what they typed on a phone.
export function PasswordField({ id, name, label, autoComplete, minLength }: { id: string; name: string; label: string; autoComplete: string; minLength?: number }) {
  const { t } = useT();
  const [shown, setShown] = useState(false);
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-password">
        <input id={id} name={name} type={shown ? "text" : "password"} autoComplete={autoComplete} minLength={minLength} required />
        <button type="button" className="auth-show" aria-pressed={shown} aria-controls={id} onClick={() => setShown((s) => !s)}>
          {shown ? t("login.hide") : t("login.show")}
        </button>
      </div>
    </div>
  );
}
