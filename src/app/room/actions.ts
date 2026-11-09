"use server";

import { redirect } from "next/navigation";
import { invitePath, isInviteToken, roomErrorMessage } from "../../core/auth-paths";
import { isPreviewStart, zones } from "../../core/preview";
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

export type InviteState = { link?: string; error?: string };

// Returns the link to the page instead of putting the secret token in a redirect URL.
export async function issueInvite(_previous: InviteState, formData: FormData): Promise<InviteState> {
  const room = String(formData.get("room") ?? "");
  const { supabase, user } = await signedIn();
  if (!user) return { error: roomErrorMessage("Sign in required") };
  const { data, error } = await supabase.rpc("issue_couple_invite", { target: room });
  if (error || typeof data !== "string" || !isInviteToken(data)) return { error: roomErrorMessage(error?.message) };
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
  if (formData.get("confirm") !== "yes") redirect("/room?error=confirm");
  const { supabase, user } = await signedIn();
  if (!user) redirect("/login?next=/room");
  const { error } = await supabase.rpc("leave_couple_room", { target: room });
  redirect(error ? "/room?error=leave" : "/room?left=1");
}

export async function signOut() {
  const supabase = await serverClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
