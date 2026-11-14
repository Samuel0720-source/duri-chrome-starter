"use server";

import { redirect } from "next/navigation";
import { authErrorKey, isEmail, passwordProblem, safeNext } from "../../core/auth-paths";
import { appOrigin, serverClient } from "../../lib/supabase/server";

// Every sign-in screen posts here. Errors go back as a short code in the address (never the raw message),
// and `next` (where to go afterwards) is always checked by safeNext so it stays on this site.
const field = (form: FormData, name: string) => String(form.get(name) ?? "");
const withNext = (path: string, next: string, extra = "") =>
  path + "?next=" + encodeURIComponent(next) + (extra ? "&" + extra : "");
const errorCode = (key: string) => key.replace("login.err.", "");

async function client(back: string) {
  const supabase = await serverClient();
  if (!supabase) redirect(back + "&error=config");
  return supabase;
}

export async function signInWithPassword(form: FormData) {
  const next = safeNext(field(form, "next"));
  const email = field(form, "email").trim();
  const back = withNext("/login", next);
  if (!isEmail(email) || !field(form, "password")) redirect(back + "&error=email");
  const supabase = await client(back);
  const { error } = await supabase.auth.signInWithPassword({ email, password: field(form, "password") });
  if (error) redirect(back + "&error=" + errorCode(authErrorKey(error.message)));
  redirect(next);
}

export async function signUpWithPassword(form: FormData) {
  const next = safeNext(field(form, "next"));
  const email = field(form, "email").trim();
  const password = field(form, "password");
  const back = withNext("/signup", next);
  if (!isEmail(email)) redirect(back + "&error=email");
  const problem = passwordProblem(password);
  if (problem) redirect(back + "&error=" + problem);
  if (password !== field(form, "again")) redirect(back + "&error=mismatch");
  const supabase = await client(back);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: appOrigin() + "/auth/callback?next=" + encodeURIComponent(next) },
  });
  if (error) redirect(back + "&error=" + errorCode(authErrorKey(error.message)));
  // With email confirmation on, there is no session yet: the person confirms from their inbox.
  // (For an address that already has an account, Supabase answers the same way, so nobody can probe emails.)
  if (!data.session) redirect(withNext("/signup", next, "sent=1"));
  redirect(next);
}

export async function sendPasswordReset(form: FormData) {
  const email = field(form, "email").trim();
  if (!isEmail(email)) redirect("/login/forgot?error=email");
  const supabase = await serverClient();
  if (!supabase) redirect("/login/forgot?error=config");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: appOrigin() + "/auth/callback?next=/login/reset",
  });
  // Same answer whether or not the address has an account.
  if (error && authErrorKey(error.message) === "login.err.rate") redirect("/login/forgot?error=rate");
  redirect("/login/forgot?sent=1");
}

// Reached from the reset email: the link signed this browser in for a short time; now pick a new password.
export async function setNewPassword(form: FormData) {
  const password = field(form, "password");
  const problem = passwordProblem(password);
  if (problem) redirect("/login/reset?error=" + problem);
  if (password !== field(form, "again")) redirect("/login/reset?error=mismatch");
  const supabase = await serverClient();
  if (!supabase) redirect("/login/reset?error=config");
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login/forgot?error=link");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/login/reset?error=" + errorCode(authErrorKey(error.message)));
  redirect("/room?password=1");
}

// Google sign-in sends no email, so it is not limited by the project's email quota.
export async function continueWithGoogle(form: FormData) {
  const next = safeNext(field(form, "next"));
  const supabase = await client(withNext("/login", next));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: appOrigin() + "/auth/callback?next=" + encodeURIComponent(next),
      // Always show the account picker, so two partners can share one device.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect(withNext("/login", next, "error=google"));
  redirect(data.url);
}
