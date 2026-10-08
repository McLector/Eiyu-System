// The snowflake on a 24x24 grid: three spokes through the centre (0/60/120 deg), two V-branches on every arm.
// Must stay identical to mobile/components/eiyu/snowflake-geometry.ts.
export const SNOWFLAKE_SPOKES = [
  { x1: 12, y1: 2, x2: 12, y2: 22 },
  { x1: 20.66, y1: 7, x2: 3.34, y2: 17 },
  { x1: 20.66, y1: 17, x2: 3.34, y2: 7 },
] as const;

export const SNOWFLAKE_BRANCHES =
  'M9.88 2.88L12 5L14.12 2.88M10.59 6.59L12 8L13.41 6.59M18.84 5.6L18.06 8.5L20.96 9.28M15.98 8.07L15.46 10L17.4 10.52M20.96 14.72L18.06 15.5L18.84 18.4M17.4 13.48L15.46 14L15.98 15.93M14.12 21.12L12 19L9.88 21.12M13.41 17.41L12 16L10.59 17.41M5.16 18.4L5.94 15.5L3.04 14.72M8.02 15.93L8.54 14L6.6 13.48M3.04 9.28L5.94 8.5L5.16 5.6M6.6 10.52L8.54 10L8.02 8.07';
