/**
 * Motion tokens shared with web (web/src/index.css `--ease-*` / `--dur-*`; a web test keeps them equal).
 * Easings are cubic-bezier control points; durations are milliseconds.
 */
export const MOTION = {
  easeOut: [0.23, 1, 0.32, 1],
  easeInOut: [0.77, 0, 0.175, 1],
  easeDrawer: [0.32, 0.72, 0, 1],
  durPress: 160,
  durFast: 150,
  durBase: 200,
  durSlow: 300,
  pressScale: 0.97,
} as const;
