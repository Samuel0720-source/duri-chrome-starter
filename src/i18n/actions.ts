"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LANG_COOKIE, isLocale } from "./core";

// Saves the language on this device for a year and returns to the page the form came from.
export async function setLanguage(formData: FormData) {
  const lang = formData.get("lang");
  const back = String(formData.get("back") ?? "/");
  const safeBack = back.startsWith("/") && !back.startsWith("//") ? back : "/";
  if (isLocale(lang)) {
    (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  redirect(safeBack);
}
