// Keep the remote voice on its own audible element. The video previews are always muted.
export function attachCallAudio(element: HTMLAudioElement, track: MediaStreamTrack, onBlocked: (blocked: boolean) => void) {
  let active = true;
  element.muted = false;
  element.volume = 1;
  element.srcObject = new MediaStream([track]);

  const play = () => {
    void element.play().then(() => {
      if (active) onBlocked(false);
    }).catch(() => {
      if (active) onBlocked(true);
    });
  };
  // Safari and mobile Chrome can pause playback after returning from the background.
  const paused = () => { if (active && element.paused) onBlocked(true); };
  const resume = () => { if (!document.hidden && element.paused) play(); };
  element.addEventListener("pause", paused);
  track.addEventListener("unmute", play);
  document.addEventListener("visibilitychange", resume);
  play();
  return {
    play,
    detach() {
      active = false;
      element.removeEventListener("pause", paused);
      track.removeEventListener("unmute", play);
      document.removeEventListener("visibilitychange", resume);
      element.pause();
      element.srcObject = null;
    },
  };
}
