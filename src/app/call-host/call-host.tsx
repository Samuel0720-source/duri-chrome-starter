"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createCallOwner } from "../room/chat/call-owner";
import { attachCallAudio } from "../room/chat/call-audio";
import { callChannel, completeDescription } from "../room/chat/call-preview";
import type { View } from "../room/chat/call-session";

type Viewer = { seen: number; signature?: string; pc?: RTCPeerConnection; generation?: string };
export function CallHost({ me, roomId }: { me: string; roomId: string }) {
  const audio = useRef<HTMLAudioElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (!location.ancestorOrigins?.[0]?.startsWith("chrome-extension://") || !audio.current) return;
    let active = true, connected = false, lastViewer = Date.now();
    let view: View = { phase: "idle", mode: "audio", note: "hint" };
    let playback: ReturnType<typeof attachCallAudio> | undefined, audioTrack: MediaStreamTrack | undefined;
    const channel = new BroadcastChannel(callChannel(me, roomId));
    const viewers = new Map<string, Viewer>();
    const notify = (duri: string, extra: object = {}) => parent.postMessage({ duri, ...extra }, location.ancestorOrigins[0]);
    const state = (client: string) => channel.postMessage({ type: "state", client, ready: connected, view: {
      phase: view.phase, mode: view.mode, note: view.note, route: view.route, muted: view.muted, cameraHidden: view.cameraHidden, background: true,
    } });
    async function preview(client: string, viewer: Viewer) {
      const tracks = [view.local?.getVideoTracks()[0], view.remote?.getVideoTracks()[0]];
      const signature = tracks.map(t => t?.id ?? "").join(":");
      if (viewer.signature === signature) return;
      viewer.signature = signature; viewer.pc?.close(); viewer.pc = undefined;
      if (!tracks.some(Boolean)) return;
      const pc = new RTCPeerConnection({ iceServers: [] });
      viewer.pc = pc;
      const generation = viewer.generation = crypto.randomUUID();
      const senders = tracks.flatMap((track, index) => track ? [{ sender: pc.addTrack(track, new MediaStream([track])), role: index ? "remote" : "local" }] : []);
      try {
        await pc.setLocalDescription(await pc.createOffer());
        const description = await completeDescription(pc);
        if (!active || viewer.pc !== pc || !description) return;
        const roles = senders.map(({sender,role}) => ({ role, mid: pc.getTransceivers().find(t => t.sender === sender)?.mid }));
        channel.postMessage({ type: "preview", client, generation, sdp: description.sdp, roles });
      } catch { pc.close(); if (viewer.pc === pc) { viewer.pc = undefined; viewer.signature = undefined; } }
    }
    const publish = () => {
      for (const [client, viewer] of viewers) { state(client); void preview(client, viewer); }
      notify("call-host-state", { phase: view.phase });
    };
    const owner = createCallOwner(me, roomId, value => {
      view = value;
      const track = value.remote?.getAudioTracks()[0];
      if (track !== audioTrack) {
        playback?.detach(); playback = undefined; audioTrack = track;
        if (track && audio.current) playback = attachCallAudio(audio.current, track, blocked => {
          if (blocked) notify("call-host-audio-blocked");
        });
      }
      publish();
    }, value => { connected = value; publish(); }, () => router.refresh());
    channel.onmessage = event => {
      const data = event.data;
      if (!active || typeof data?.client !== "string" || data.client.length > 80 || !owner) return;
      const id = data.client;
      if (data.type === "hello") {
        lastViewer = Date.now();
        if (!viewers.has(id)) viewers.set(id, { seen: Date.now() });
        const viewer = viewers.get(id)!; viewer.seen = Date.now(); state(id); void preview(id, viewer); return;
      }
      const viewer = viewers.get(id);
      if (!viewer) return;
      switch (data.type) {
        case "detach": viewer.pc?.close(); viewers.delete(id); break;
        case "start": if (connected && (data.mode === "audio" || data.mode === "video")) owner.session.start(data.mode); break;
        case "accept": if (connected) owner.session.accept(); break;
        case "end": void owner.session.end().then(() => { if (active) channel.postMessage({ type: "ended", client: id, request: data.request }); }); break;
        case "mute": if (typeof data.value === "boolean") owner.session.setMuted(data.value); break;
        case "camera": if (typeof data.value === "boolean") owner.session.setCameraHidden(data.value); break;
        case "answer": if (data.generation === viewer.generation && viewer.pc?.signalingState === "have-local-offer" && typeof data.sdp === "string")
          void viewer.pc.setRemoteDescription({ type: "answer", sdp: data.sdp }).catch(() => {}); break;
      }
    };
    // Release unused documents/sockets, and validate cookies while no popup is open.
    const cleanup = setInterval(() => {
      for (const [id, viewer] of viewers) if (Date.now() - viewer.seen > 12000) { viewer.pc?.close(); viewers.delete(id); }
      if (view.phase === "idle" && !viewers.size && Date.now() - lastViewer > 30000) notify("call-host-close");
    }, 5000);
    const authCheck = setInterval(() => {
      void fetch("/api/session/token", { cache: "no-store", headers: { "X-Duri-Surface": "popup" } }).then(async response => {
        if (response.status === 401 || response.status === 403 || (response.ok && (await response.json()).userId !== me)) { await owner?.session.end("offline"); notify("call-host-close"); }
      }).catch(() => {});
    }, 30000);
    return () => {
      active = false; clearInterval(cleanup); clearInterval(authCheck);
      owner?.dispose(); playback?.detach(); viewers.forEach(v => v.pc?.close()); channel.close();
    };
  }, [me, roomId, router]);
  return <audio ref={audio} autoPlay data-call-owner="background" />;
}
