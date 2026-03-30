/** Human-readable duration from seconds (for CTF time-to-flag). */
export function formatDurationSec(sec) {
  if (sec == null || sec < 0 || Number.isNaN(sec)) return null;
  const s = Math.floor(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}
