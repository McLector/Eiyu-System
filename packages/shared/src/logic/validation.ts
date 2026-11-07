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
export const MAX_DISPLAY_NAME_LENGTH = 80;
export const PROFILE_TEXT_MAX_LENGTH = 80;
export const MAX_QUEST_NAME_LENGTH = 80;

const NAME_EDGE_SEPARATORS = /^[\s\u00a0\u200b\u200c\u200d\u2060\ufeff]+|[\s\u00a0\u200b\u200c\u200d\u2060\ufeff]+$/gu;
const NAME_INVISIBLE_CONTENT = /[\s\u00a0\u200b\u200c\u200d\u2060\ufeff]/gu;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Generic required-field check with a label for a readable message. */
export function validateRequired(value: string, label: string): string | null {
  return value.trim().length === 0 ? `${label} is required.` : null;
}

export function validateDisplayName(value: string): string | null {
  const normalized = normalizeNameBoundaries(value);
  if (!hasVisibleNameContent(normalized)) return 'Enter a display name.';
  const length = Array.from(normalized).length;
  if (length < 2) return 'Display name must be at least 2 characters.';
  if (length > MAX_DISPLAY_NAME_LENGTH)
    return `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`;
  return null;
}

/** Profile text uses Unicode code points for the shared 80-character boundary. */
export function validateProfileText(value: string, label: string): string | null {
  const normalized = normalizeNameBoundaries(value);
  if (!hasVisibleNameContent(normalized)) return `Enter a ${label.toLowerCase()}.`;
  if (Array.from(normalized).length > PROFILE_TEXT_MAX_LENGTH) {
    return `${label} must be ${PROFILE_TEXT_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

/** Strip separator/invisible code points only at the edges of a name. */
export function normalizeNameBoundaries(value: string): string {
  return value.replace(NAME_EDGE_SEPARATORS, '');
}

function hasVisibleNameContent(value: string): boolean {
  return value.replace(NAME_INVISIBLE_CONTENT, '').length > 0;
}

export function validateQuestName(value: string): string | null {
  const normalized = normalizeNameBoundaries(value);
  if (!hasVisibleNameContent(normalized)) return 'Enter a quest name.';
  if (Array.from(normalized).length > MAX_QUEST_NAME_LENGTH) {
    return `Quest name must be ${MAX_QUEST_NAME_LENGTH} characters or fewer.`;
  }
  return null;
}

/** Validate changed quest names while preserving an unchanged legacy value. */
export function normalizeEditableQuestName(value: string, original?: string): string {
  if (original !== undefined && value === original) return value;
  const normalized = normalizeNameBoundaries(value);
  const error = validateQuestName(normalized);
  if (error) throw new Error(error);
  return normalized;
}

export interface ProfileEditInput {
  displayName: string;
  userClass: string;
}

export function normalizeProfileEdit(input: ProfileEditInput, original?: ProfileEditInput): ProfileEditInput {
  // An unchanged grandfathered value may exceed today's limit. Preserve it
  // verbatim while validating every field the user actually edits.
  const displayNameChanged = !original || input.displayName !== original.displayName;
  const userClassChanged = !original || input.userClass !== original.userClass;
  const displayName = displayNameChanged ? normalizeNameBoundaries(input.displayName) : input.displayName;
  const userClass = userClassChanged ? normalizeNameBoundaries(input.userClass) : input.userClass;
  if (displayNameChanged) {
    const displayNameError = validateProfileText(displayName, 'Display name');
    if (displayNameError) throw new Error(displayNameError);
  }
  if (userClassChanged) {
    const userClassError = validateProfileText(userClass, 'Class');
    if (userClassError) throw new Error(userClassError);
  }
  return { displayName, userClass };
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
