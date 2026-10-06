/** Spacing, radius and size tokens both apps draw from. Sizes are px on web and dp on mobile; never scale them by screen width. */
export const SPACE = { xs: 4, sm: 8, md: 14, gutter: 16, lg: 20, xl: 32 } as const;

export const RADIUS = { control: 4, card: 8, sheet: 16 } as const;

/** Minimum size of anything pressable. */
export const TOUCH_TARGET = 48;

/** The mobile tab bar: its content height at font scale 1, and how far it grows for larger system fonts. */
export const TAB_BAR = { base: 49, growthPerScale: 40, maxFontScale: 2 } as const;

/**
 * Height of the tab bar including the system navigation bar inset under it. The bar sits in the layout (not over it),
 * so a screen needs no allowance of its own whether the phone uses gestures (small inset) or 3 buttons (about 48dp).
 */
export function tabBarHeight(fontScale: number, bottomInset: number): number {
  const scale = Number.isFinite(fontScale) ? Math.min(Math.max(fontScale, 1), TAB_BAR.maxFontScale) : 1;
  const inset = Number.isFinite(bottomInset) && bottomInset > 0 ? bottomInset : 0;
  return TAB_BAR.base + Math.ceil((scale - 1) * TAB_BAR.growthPerScale) + inset;
}
