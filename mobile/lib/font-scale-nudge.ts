import { useState } from 'react';
import { useWindowDimensions } from 'react-native';

/**
 * Android keeps cached text measurements across a live system font-size change (the Activity now survives it through the
 * `fontScale` configChanges entry), so text can stay clipped at the old size. The Oppo spikes
 * (docs/plans/2026-10-23-s02-text-prop-spike.md and ...-font-matrix-spike.md) showed that a tiny public letterSpacing
 * change on the Text/TextInput makes it re-measure: offsets alternated 0 -> 0.01 -> 0.02 -> 0.01. This is the one
 * permitted typography exception. It never runs at launch, never touches fontSize, and never disables or caps scaling.
 * Unproved: editing a multiline field after a cycle.
 */
export const FONT_SCALE_NUDGE_A = 0.01;
export const FONT_SCALE_NUDGE_B = 0.02;

export type FontScaleNudge = { letterSpacing: number };

/** Base spacing plus the offset, so a style that already tracks (for example 1.2) keeps its look. */
export function nudgedLetterSpacing(base: number | undefined, offset: number): number {
  return (base ?? 0) + offset;
}

/** Counts system font-scale changes seen while mounted (0 at launch). One listener per caller. */
export function useFontScaleChanges(): number {
  const { fontScale } = useWindowDimensions();
  const [seen, setSeen] = useState({ fontScale, changes: 0 });
  if (seen.fontScale !== fontScale) setSeen({ fontScale, changes: seen.changes + 1 });
  return seen.fontScale !== fontScale ? seen.changes + 1 : seen.changes;
}

/** The alternating offset for a change count, or undefined before any change. */
export function nudgeOffsetForChanges(changes: number): number | undefined {
  if (changes <= 0) return undefined;
  return changes % 2 === 1 ? FONT_SCALE_NUDGE_A : FONT_SCALE_NUDGE_B;
}

/**
 * Returns undefined until the system font scale changes while the app is running, then a `{ letterSpacing }` patch that
 * alternates between the two spike offsets on every change. Append it last in a style array.
 */
export function useFontScaleNudge(baseLetterSpacing?: number): FontScaleNudge | undefined {
  const offset = nudgeOffsetForChanges(useFontScaleChanges());
  return offset === undefined ? undefined : { letterSpacing: nudgedLetterSpacing(baseLetterSpacing, offset) };
}
