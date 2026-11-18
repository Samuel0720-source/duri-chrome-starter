"use client";
import { signOut } from "./actions";
import { stopRoomCall } from "./chat/call-lifecycle";

export function SignOutForm({ label }: { label: string }) {
  return <form action={async () => { await stopRoomCall(); await signOut(); }}>
    <button type="submit" className="link">{label}</button>
  </form>;
}
