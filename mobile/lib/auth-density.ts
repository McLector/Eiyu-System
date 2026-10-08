export type AuthTier = 'roomy' | 'compact' | 'tight';

/** Non-interactive sizes of the auth screen. Inputs, buttons, the checkbox and links keep their 48 dp targets in every tier. */
export interface AuthDensity {
  tier: AuthTier;
  scrollPadV: number;
  brandMargin: number;
  logoSize: number;
  logoGap: number;
  logoGlyph: number;
  titleSize: number;
  cardPadTop: number;
  cardPadBottom: number;
  cardPadX: number;
  accentGap: number;
  formGap: number;
  switchGap: number;
}

/**
 * Usable heights (window height minus safe-area insets, divided by the font scale) each tier needs for the sign-up form
 * with the strength meter. Computed from the layout's styles, not measured on a device: roomy needs about 830 dp,
 * compact about 720 dp, tight about 660 dp; each constant adds a margin on top. Below the tight need the screen scrolls.
 */
export const AUTH_ROOMY_MIN_HEIGHT = 850;
export const AUTH_COMPACT_MIN_HEIGHT = 740;

const TIERS: Record<AuthTier, AuthDensity> = {
  roomy: {
    tier: 'roomy', scrollPadV: 32, brandMargin: 28, logoSize: 56, logoGap: 14, logoGlyph: 24, titleSize: 28,
    cardPadTop: 22, cardPadBottom: 20, cardPadX: 20, accentGap: 20, formGap: 14, switchGap: 12,
  },
  compact: {
    tier: 'compact', scrollPadV: 12, brandMargin: 12, logoSize: 44, logoGap: 10, logoGlyph: 20, titleSize: 22,
    cardPadTop: 14, cardPadBottom: 14, cardPadX: 16, accentGap: 14, formGap: 10, switchGap: 6,
  },
  tight: {
    tier: 'tight', scrollPadV: 8, brandMargin: 8, logoSize: 36, logoGap: 8, logoGlyph: 17, titleSize: 20,
    cardPadTop: 12, cardPadBottom: 12, cardPadX: 14, accentGap: 10, formGap: 8, switchGap: 0,
  },
};

/**
 * Picks how tightly the auth screen packs its non-interactive spacing. A larger font scale needs more height for the same
 * text, so the height is divided by it; a scale below 1 is treated as 1 so smaller text never makes the layout roomier.
 * An unusable height (NaN, infinite, zero or negative) keeps today's roomy look.
 */
export function authDensity(windowHeight: number, fontScale: number): AuthDensity {
  if (!Number.isFinite(windowHeight) || windowHeight <= 0) return TIERS.roomy;
  const scale = Number.isFinite(fontScale) && fontScale > 1 ? fontScale : 1;
  const usable = windowHeight / scale;
  if (usable >= AUTH_ROOMY_MIN_HEIGHT) return TIERS.roomy;
  if (usable >= AUTH_COMPACT_MIN_HEIGHT) return TIERS.compact;
  return TIERS.tight;
}
