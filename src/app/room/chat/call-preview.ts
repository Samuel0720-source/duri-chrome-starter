// Local-only video preview transport between two same-origin extension frames.
// The real call/audio stays in the hidden host; closing a preview cannot end it.
export async function completeDescription(pc: RTCPeerConnection) {
  if (pc.iceGatheringState !== "complete") await new Promise<void>(resolve => {
    const done = () => { clearTimeout(timer); pc.removeEventListener("icegatheringstatechange", changed); resolve(); };
    const changed = () => { if (pc.iceGatheringState === "complete") done(); };
    const timer = setTimeout(done, 2500);
    pc.addEventListener("icegatheringstatechange", changed); changed();
  });
  return pc.localDescription;
}
export const callChannel = (me: string, roomId: string) => `duri-call-v1:${me}:${roomId}`;
export type PreviewRole = { mid: string | null; role: "local" | "remote" };
