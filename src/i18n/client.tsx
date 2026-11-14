"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Locale } from "./core";
import { makeT, type T } from "./dict";

const Ctx = createContext<{ locale: Locale; t: T }>({ locale: "ko", t: makeT("ko") });

// The server decides the language once per request and hands it down; client screens read it here.
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(locale) }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT() {
  return useContext(Ctx);
}

// "<n>초 남았어요" with parts={{ n: <strong>12</strong> }} -> text with the element in place of <n>.
export function Rich({ text, parts }: { text: string; parts: Record<string, ReactNode> }) {
  const pieces = text.split(/<(\w+)>/);
  return <>{pieces.map((p, i) => (i % 2 === 1 ? <span key={i} className="rich-part">{parts[p] ?? null}</span> : p))}</>;
}
