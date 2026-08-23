/**
 * Pure helpers for Screen's safe-area padding math (see components/eiyu/screen.tsx).
 * Extracted so the Yoga edge-vs-shorthand resolution rules are unit-testable
 * without rendering RN components.
 */

export interface FlatPadding {
  paddingTop?: unknown;
  paddingBottom?: unknown;
  paddingVertical?: unknown;
}

export interface VerticalPadding {
  top: number;
  bottom: number;
}

/**
 * Resolves a flattened style's concrete per-edge vertical paddings following
 * Yoga semantics: a specific edge (paddingTop/paddingBottom) always wins over
 * the shorthand (paddingVertical), regardless of style-array order.
 * Non-numeric values (percentages, 'auto') default to 0.
 */
export function resolveVerticalPadding(flat: FlatPadding): VerticalPadding {
  const num = (v: unknown): v is number => typeof v === 'number';
  return {
    top: num(flat.paddingTop) ? flat.paddingTop : num(flat.paddingVertical) ? flat.paddingVertical : 0,
    bottom: num(flat.paddingBottom)
      ? flat.paddingBottom
      : num(flat.paddingVertical)
        ? flat.paddingVertical
        : 0,
  };
}