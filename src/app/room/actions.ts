"use server";

import { redirect } from "next/navigation";
import { invitePath, isInviteToken, roomErrorKey } from "../../core/auth-paths";
import { isPreviewStart, zones } from "../../core/preview";
import { isMood } from "../../core/moods";
import { appOrigin, serverClient } from "../../lib/supabase/server";

async function signedIn() {
  const supabase = await serverClient();
  if (!supabase) redirect("/login?error=config");
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function createRoom(formData: FormData) {
  const start = String(formData.get("start") ?? "");
  const zone = String(formData.get("zone") ?? "");
  if (!isPreviewStart(start) || !zones.some((item) => item.value === zone)) redirect("/room?error=input");
  const { supabase, user } = await signedIn();
  if (!user) redirect("/login?next=/room");
  const { error } = await supabase.rpc("create_couple_room", { first_day: start, zone });
  redirect(error ? "/room?error=create" : "/room");
}

// error is a dictionary key (err.*), shown by the invite box in the chosen language.
export type InviteState = { link?: string; error?: string };

// Returns the link to the page instead of putting the secret token in a redirect URL.
export async function issueInvite(_previous: InviteState, formData: FormData): Promise<InviteState> {
  const room = String(formData.get("room") ?? "");
  const { supabase, user } = await signedIn();
  if (!user) return { error: roomErrorKey("Sign in required") };
  const { data, error } = await supabase.rpc("issue_couple_invite", { target: room });
  if (error || typeof data !== "string" || !isInviteToken(data)) return { error: roomErrorKey(error?.message) };
  return { link: appOrigin() + invitePath(data) };
}

export async function acceptInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!isInviteToken(token)) redirect("/room");
  const { supabase, user } = await signedIn();
  if (!user) redirect("/login?next=" + encodeURIComponent(invitePath(token)));
  const { error } = await supabase.rpc("accept_couple_invite", { raw_token: token });
  if (error) {
    const kind = error.message.includes("duplicate key") ? "member" : "unavailable";
    redirect(invitePath(token) + "?error=" + kind);
  }
  redirect("/room");
}

// Leaving closes the room for both partners; the partner sees a notice next visit.
export async function leaveRoom(formData: FormData) {
  const room = String(formData.get("room") ?? "");
  if (formData.get("confirm") !== "yes") redirect("/room/settings?error=leave#account");
  const { supabase, user } = await signedIn();
  if (!user) redirect("/login?next=/room");
  const { error } = await supabase.rpc("leave_couple_room", { target: room });
  redirect(error ? "/room/settings?error=leave#account" : "/room?left=1");
}

// Deletes the account and all of its rows in one database transaction.
export async function deleteAccount(formData: FormData) {
  // A person without a room deletes from /room; everyone else from the settings page.
  const back = formData.get("back") === "/room" ? "/room?error=delete" : "/room/settings?error=delete#account";
  if (formData.get("confirm") !== "yes") redirect(back);
  const { supabase, user } = await signedIn();
  if (!user) redirect("/login?next=/room");
  const { error } = await supabase.rpc("delete_my_account");
  if (error) redirect(back);
  // The account is gone; clear this browser's session cookies too.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?deleted=1");
}

// Room home: shared mood, first day and time zone, and plans. The RPCs check membership.
export async function setMood(formData: FormData) {
  const room = String(formData.get("room") ?? "");
  const mood = formData.get("mood");
  if (!isMood(mood)) redirect("/room/settings?error=room#room");
  const { supabase, user } = await signedIn();
  if (!user) redirect("/login?next=/room");
  const { error } = await supabase.rpc("set_room_mood", { target: room, new_mood: mood });
  redirect(error ? "/room/settings?error=room#room" : "/room/settings?saved=room#room");
}

export async function setStart(formData: FormData) {
  const room = String(formData.get("room") ?? "");
  const start = String(formData.get("start") ?? "");
  const zone = String(formData.get("zone") ?? "");
  if (!isPreviewStart(start) || !zones.some((item) => item.value === zone)) redirect("/room/settings?error=room#room");
  const { supabase, user } = await signedIn();
  if (!user) redirect("/login?next=/room");
  const { error } = await supabase.rpc("set_room_start", { target: room, first_day: start, zone });
  redirect(error ? "/room/settings?error=room#room" : "/room/settings?saved=room#room");
}

// The nickname I use for my partner (empty clears it). The database checks length and membership.
export async function setNickname(formData: FormData) {
  const room = String(formData.get("room") ?? "");
  const nick = String(formData.get("nick") ?? "").trim();
  if (nick.length > 20 || /[\u0000-\u001f\u007f]/.test(nick)) redirect("/room/settings?error=nick#nick");
  const { supabase, user } = await signedIn();
  if (!user) redirect("/login?next=/room/settings");
  const { error } = await supabase.rpc("set_partner_nickname", { target: room, nick });
  redirect(error ? "/room/settings?error=nick#nick" : "/room/settings?saved=nick#nick");
}

export async function addPlan(formData: FormData) {
  const room = String(formData.get("room") ?? "");
  const date = String(formData.get("date") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!isPreviewStart(date) || title.length < 1 || title.length > 60) redirect("/room?error=plan#plans");
  const { supabase, user } = await signedIn();
  if (!user) redirect("/login?next=/room");
  const { error } = await supabase.rpc("add_room_plan", { target: room, plan_date: date, plan_title: title });
  redirect(error ? "/room?error=plan#plans" : "/room#plans");
}

export async function removePlan(formData: FormData) {
  const plan = String(formData.get("plan") ?? "");
  const { supabase, user } = await signedIn();
  if (!user) redirect("/login?next=/room");
  const { error } = await supabase.rpc("remove_room_plan", { plan });
  redirect(error ? "/room?error=plan#plans" : "/room#plans");
}

export async function signOut() {
  const supabase = await serverClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
