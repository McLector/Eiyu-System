/**
 * Pure form-field validators (improvement-pass item #13).
 *
 * Every validator returns a human-readable error string, or null when the
 * value is valid - trivially unit-testable and directly renderable as an
 * inline per-field error. No form library; screens compose these themselves.
 * Backend constraints stay the source of truth (e.g. Supabase's default
 * 6-char password minimum).
 */

export const MIN_PASSWORD_LENGTH = 6;
export const MAX_DISPLAY_NAME_LENGTH = 40;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Generic required-field check with a label for a readable message. */
export function validateRequired(value: string, label: string): string | null {
  return value.trim().length === 0 ? `${label} is required.` : null;
}

export function validateDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter a display name.';
  if (trimmed.length < 2) return 'Display name must be at least 2 characters.';
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH)
    return `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`;
  return null;
}

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return 'Enter your email.';
  if (!EMAIL_RE.test(trimmed)) return 'That does not look like a valid email address.';
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return 'Enter a password.';
  if (value.length < MIN_PASSWORD_LENGTH)
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!confirm) return 'Confirm your password.';
  if (password !== confirm) return 'Passwords do not match.';
  return null;
}

/**
 * Live UI hint only (0-3), never a security control. Rewards length and
 * mixed character classes so the hint improves as the user types.
 */
export function passwordStrength(value: string): 0 | 1 | 2 | 3 {
  if (!value) return 0;
  let score = 1;
  if (value.length >= 10 || /[^a-zA-Z0-9]/.test(value)) score += 1;
  if (/[a-zA-Z]/.test(value) && /\d/.test(value)) score += 1;
  return Math.min(score, 3) as 0 | 1 | 2 | 3;
}
