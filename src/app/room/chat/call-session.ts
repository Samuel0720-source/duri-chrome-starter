import { isSignal, type Kind, type Mode } from "../../../core/room-call";

export type Phase = "idle" | "ringing" | "incoming" | "connecting" | "connected";
export type CallNote = "hint" | "ended" | "device" | "network" | "busy" | "timeout" | "offline";
type Session = { id: string; mode: Mode; caller: boolean; phase: Phase; pc?: RTCPeerConnection; stream?: MediaStream };
export type View = { phase: Phase; mode: Mode; note: CallNote; local?: MediaStream; remote?: MediaStream };

export class CallSession {
  private current?: Session;
  private timer?: ReturnType<typeof setTimeout>;
  private remote?: MediaStream;
  constructor(private me: string, private send: (id: string, kind: Kind, detail: string) => Promise<void>,
    private render: (view: View) => void) {}

  private show(s: Session) {
    this.render({ phase: s.phase, mode: s.mode, note: "hint", local: s.stream, remote: this.remote });
  }
  private timeout(s: Session, ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (s === this.current) this.end("timeout"); }, ms);
  }
  private async signal(s: Session, kind: Kind, detail = "") {
    try { await this.send(s.id, kind, detail); }
    catch { if (this.current === s) this.end("offline", false); }
  }
  start(mode: Mode) {
    if (this.current) return;
    const s: Session = { id: crypto.randomUUID(), mode, caller: true, phase: "ringing" };
    this.current = s;
    this.show(s);
    this.timeout(s, 40_000);
    void this.signal(s, "ring", mode);
  }
  accept() {
    const s = this.current;
    if (!s || s.phase !== "incoming") return;
    s.phase = "connecting";
    this.show(s);
    this.timeout(s, 45_000);
    void this.signal(s, "accept");
  }
  end(note: CallNote = "ended", notify = true) {
    const s = this.current;
    if (!s) return;
    this.current = undefined;
    clearTimeout(this.timer);
    if (notify) void this.send(s.id, "bye", "").catch(() => {});
    s.pc?.close();
    s.stream?.getTracks().forEach(track => track.stop());
    this.remote = undefined;
    this.render({ phase: "idle", mode: s.mode, note });
  }
  async receive(value: unknown) {
    if (!isSignal(value) || value.sender === this.me) return;
    const { kind, id, detail } = value;
    if (kind === "ring") {
      if (this.current?.id === id) return;
      if (this.current) {
        // If both called at once, both devices keep the lexicographically smaller invitation.
        if (this.current.phase === "ringing" && id < this.current.id) this.end("ended");
        else { void this.send(id, "busy", "").catch(() => {}); return; }
      }
      const s: Session = { id, mode: detail as Mode, phase: "incoming", caller: false };
      this.current = s;
      this.show(s);
      this.timeout(s, 40_000);
      return;
    }
    const s = this.current;
    if (!s || s.id !== id) return;
    if (kind === "bye" || kind === "busy") { this.end(kind === "busy" ? "busy" : "ended", false); return; }
    try {
      if (kind === "accept" && s.caller && s.phase === "ringing") {
        s.phase = "connecting";
        this.show(s);
        this.timeout(s, 45_000);
        const pc = await this.openPeer(s);
        if (pc) await this.describe(s, pc, await pc.createOffer());
      } else if (kind === "offer" && !s.caller && s.phase === "connecting" && !s.pc) {
        const pc = await this.openPeer(s);
        if (!pc) return;
        await pc.setRemoteDescription({ type: "offer", sdp: detail });
        await this.describe(s, pc, await pc.createAnswer());
      } else if (kind === "answer" && s.caller && s.pc?.signalingState === "have-local-offer") {
        await s.pc.setRemoteDescription({ type: "answer", sdp: detail });
      }
    } catch { if (s === this.current) this.end("network"); }
  }
  private async openPeer(s: Session) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    s.pc = pc;
    pc.ontrack = event => {
      if (s !== this.current) return;
      this.remote = event.streams[0];
      this.show(s);
    };
    pc.onconnectionstatechange = () => {
      if (s !== this.current) return;
      if (pc.connectionState === "connected") {
        clearTimeout(this.timer);
        s.phase = "connected";
        this.show(s);
      } else if (pc.connectionState === "failed") this.end("network");
      else if (pc.connectionState === "disconnected") this.timeout(s, 12_000);
    };
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: s.mode === "video" }); }
    catch { if (s === this.current) this.end("device"); return; }
    if (s !== this.current) { stream.getTracks().forEach(track => track.stop()); return; }
    s.stream = stream;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    this.show(s);
    return pc;
  }
  // Bundle ICE candidates into one SDP message to keep signaling traffic small.
  private async describe(s: Session, pc: RTCPeerConnection, desc: RTCSessionDescriptionInit) {
    await pc.setLocalDescription(desc);
    if (pc.iceGatheringState !== "complete") {
      await new Promise<void>(resolve => {
        const finish = () => {
          clearTimeout(timer);
          pc.removeEventListener("icegatheringstatechange", ready);
          resolve();
        };
        const ready = () => { if (pc.iceGatheringState === "complete") finish(); };
        const timer = setTimeout(finish, 4500);
        pc.addEventListener("icegatheringstatechange", ready);
        ready();
      });
    }
    if (s === this.current && pc.localDescription)
      await this.signal(s, desc.type === "offer" ? "offer" : "answer", pc.localDescription.sdp);
  }
}
