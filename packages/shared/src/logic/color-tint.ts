/**
 * Tint a stat/state color for secondary text next to it (redesign spec
 * section 6) — theme-aware, since a flat opacity fade toward the
 * background works on a near-black surface but is backwards on a
 * near-white one: fading a bright hue toward a LIGHT background makes it
 * blend in rather than stand out, destroying contrast instead of
 * preserving it. Dark theme keeps the original fade-toward-background
 * approach at a higher opacity; light theme mixes toward a dark base
 * color instead, which is the correct direction for that surface. Both
 * paths are verified to clear 4.5:1 WCAG AA for all five STAT_COLORS
 * against this app's flat page backgrounds — see
 * packages/shared/src/logic/__tests__/color-tint.test.ts.
 */
export function tintSecondaryText(hex: string, darkMode: boolean): string {
  const match = hex.match(/^#([0-9a-f]{6})$/i);
  if (!match) throw new Error(`Unsupported color format: ${hex}`);
  const n = parseInt(match[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;

  if (darkMode) {
    return `rgba(${r},${g},${b},0.85)`;
  }

  const baseR = 0x0b;
  const baseG = 0x22;
  const baseB = 0x33;
  const mixedR = Math.round(r * 0.45 + baseR * 0.55);
  const mixedG = Math.round(g * 0.45 + baseG * 0.55);
  const mixedB = Math.round(b * 0.45 + baseB * 0.55);
  return `rgb(${mixedR},${mixedG},${mixedB})`;
}
