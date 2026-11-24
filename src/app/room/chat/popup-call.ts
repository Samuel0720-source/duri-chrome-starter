import { deviceNote, type CallController, type View } from "./call-session";
import { callChannel, completeDescription, type PreviewRole } from "./call-preview";

// A disposable controller/view. No credentials, call signaling or captured media
// survive here; the same-origin host is the only owner of the partner connection.
export function createPopupCall(me: string, roomId: string, render: (view: View) => void, ready: (value: boolean) => void) {
  const channel = new BroadcastChannel(callChannel(me, roomId));
  const id = crypto.randomUUID();
  const endings = new Map<string, () => void>();
  let localError = false;
  let active = true, lastReply = Date.now(), preview: RTCPeerConnection | undefined;
  let view: View = { phase: "idle", mode: "audio", note: "hint", background: true };
  let local: MediaStream | undefined, remote: MediaStream | undefined;
  const send = (type: string, extra: object = {}) => { if (active) channel.postMessage({ type, client: id, ...extra }); };
  const show = () => render({ ...view, local, remote, background: true });
  const ensure = () => window.postMessage({ duri: "call-host-ensure" }, location.origin);
  const hello = () => { send("hello"); if (Date.now() - lastReply > 8000) { ready(false); if (!localError && view.phase === "idle") { view = { ...view, note: "offline" }; show(); } ensure(); } };
  async function authorize(mode: "audio" | "video") {
    // Prompt on the visible user-initiated surface, never from a hidden document.
    const microphone = await navigator.permissions.query({ name: "microphone" as PermissionName }).catch(() => null);
    const camera = mode === "video" ? await navigator.permissions.query({ name: "camera" as PermissionName }).catch(() => null) : null;
    if (microphone?.state !== "granted" || (mode === "video" && camera?.state !== "granted")) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" });
      stream.getTracks().forEach(track => track.stop());
    }
  }
  async function action(command: "start" | "accept", mode: "audio" | "video") {
    try { await authorize(mode); localError = false; send(command, { mode }); }
    catch (error) { send("end"); localError = true; view = { phase: "idle", mode, note: deviceNote(error), background: true }; show(); }
  }
  const session: CallController = {
    start: mode => { void action("start", mode); }, accept: () => { void action("accept", view.mode); },
    end: () => new Promise<void>(resolve => {
      const request = crypto.randomUUID();
      const timer = setTimeout(() => { endings.delete(request); resolve(); }, 1800);
      endings.set(request, () => { clearTimeout(timer); endings.delete(request); resolve(); });
      send("end", { request });
    }),
    resumeAudio: () => send("play"),
    setMuted: value => send("mute", { value }), setCameraHidden: value => send("camera", { value }),
  };
  channel.onmessage = event => {
    const data = event.data;
    if (!active || data?.client !== id) return;
    if (data.type === "ended") endings.get(data.request)?.();
    if (data.type === "state") {
      lastReply = Date.now(); ready(data.ready === true);
      if (localError && data.view.phase === "idle") return;
      localError = false; view = data.view;
      if (view.phase === "idle") { preview?.close(); preview = undefined; local = remote = undefined; }
      show();
    }
    if (data.type === "preview" && typeof data.sdp === "string" && Array.isArray(data.roles)) {
      const pc = new RTCPeerConnection({ iceServers: [] });
      preview?.close(); preview = pc; local = remote = undefined;
      const roles = data.roles as PreviewRole[];
      pc.ontrack = event => {
        if (pc !== preview) return;
        const stream = new MediaStream([event.track]);
        if (roles.find(r => r.mid === event.transceiver.mid)?.role === "local") local = stream; else remote = stream;
        show();
      };
      void (async () => {
        try {
          await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
          await pc.setLocalDescription(await pc.createAnswer());
          const description = await completeDescription(pc);
          if (pc === preview && description) send("answer", { generation: data.generation, sdp: description.sdp });
        } catch { if (pc === preview) { pc.close(); preview = undefined; } }
      })();
    }
  };
  const bridgeError = (event: MessageEvent) => {
    if (event.source === window && event.origin === location.origin && event.data?.duri === "call-host-error") {
      ready(false); view = { phase: "idle", mode: "audio", note: "offline", background: true }; show();
    }
  };
  window.addEventListener("message", bridgeError);
  ensure(); hello();
  const heartbeat = setInterval(hello, 3000);
  return { session, dispose() {
    send("detach"); active = false; endings.forEach(done => done()); clearInterval(heartbeat); preview?.close(); channel.close();
    window.removeEventListener("message", bridgeError);
  } };
}
