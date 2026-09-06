/**
 * Tint a stat/state's own color into a lower-opacity rgba string for
 * secondary text that sits next to it (redesign spec §6) — e.g. a STR row's
 * "62/175" XP fraction reads as a dim red, not the same flat muted-gray used
 * everywhere else. Replaces reaching for one universal muted token
 * regardless of context. Only accepts 6-digit hex in, since every existing
 * stat/rank/state color in this codebase (`STAT_COLORS`, `RANK_CONFIG`) is
 * already in that format.
 */
export function tintSecondaryText(hex: string, opacity = 0.72): string {
  const match = hex.match(/^#([0-9a-f]{6})$/i);
  if (!match) throw new Error(`Unsupported color format: ${hex}`);
  const n = parseInt(match[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${opacity})`;
}
