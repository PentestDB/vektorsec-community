/**
 * Format Magnitude browser agent errors with helpful suggestions.
 */
export function formatMagnitudeError(error: { message?: string }): string {
  const msg = error?.message ?? "";
  const isXServerError =
    /X server|XServer|headed browser|Missing X server|\$DISPLAY/i.test(msg) ||
    /xvfb-run|without having a XServer/i.test(msg);

  if (isXServerError) {
    return `${msg} — To fix: set up VNC (Settings → VNC) for headed mode, or enable headless mode (Settings → Magnitude → Headless).`;
  }
  return msg;
}
