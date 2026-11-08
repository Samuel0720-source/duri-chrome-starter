// Periodic corrections use this rule. Explicit play, pause and seek commands apply immediately.
export function shouldCorrectDrift(
  remoteSeconds: number,
  localSeconds: number,
  sinceLastCorrectionMs: number,
) {
  if (
    ![remoteSeconds, localSeconds, sinceLastCorrectionMs].every(Number.isFinite)
  )
    return false;
  return (
    Math.abs(remoteSeconds - localSeconds) > 1 && sinceLastCorrectionMs >= 3000
  );
}
