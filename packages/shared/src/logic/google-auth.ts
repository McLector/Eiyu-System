/**
 * Google sign-in: callback error mapping and the "finish sign-up" check.
 *
 * Shapes come from real GoTrue v2.196.0 logins (S03 T1/T4). A refused link reaches the client as
 * `error=server_error&error_code=unexpected_failure&error_description=Error+creating+identity`,
 * in both the query and the hash; the trigger's own text is lost on the way.
 */

export const GOOGLE_LINK_REFUSED_MESSAGE =
  "Google couldn't connect to this email. If you already have an Eiyu account, sign in with your password and verify your email first, then use Google.";
export const GOOGLE_EMAIL_UNVERIFIED_MESSAGE = 'Google says this email is not verified. Verify it with Google, then try again.';
export const GOOGLE_CANCELLED_MESSAGE = 'Google sign-in was cancelled.';
export const GOOGLE_GENERIC_MESSAGE = 'Google sign-in did not work. Try again, or sign in with your email and password.';

export type GoogleSignInFailure = 'cancelled' | 'link-refused' | 'email-unverified' | 'generic';

export interface OAuthErrorParams {
  error?: string | null;
  error_code?: string | null;
  error_description?: string | null;
}

const KEYS = ['error', 'error_code', 'error_description'] as const;

/** Reads error parameters from a callback URL's query and hash; the query wins when both set a key. Null when none. */
export function readOAuthErrorParams(rawUrl: string): OAuthErrorParams | null {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  let url: URL;
  try { url = new URL(rawUrl.trim(), 'http://placeholder.invalid'); } catch { return null; }
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.slice(1));
  const found: OAuthErrorParams = {};
  let any = false;
  for (const key of KEYS) {
    const value = [query.get(key), hash.get(key)].find(v => v !== null && v.trim() !== '');
    found[key] = value ?? null;
    if (value !== undefined) any = true;
  }
  return any ? found : null;
}

/** The hook's 403 text and a refused link both come back as errors; only the description tells them apart. */
export function classifyGoogleSignInError(params: OAuthErrorParams | null | undefined): GoogleSignInFailure {
  const description = (params?.error_description ?? '').toLowerCase();
  if (description.includes('error creating identity')) return 'link-refused';
  if (description.includes('email is not verified')) return 'email-unverified';
  if (params?.error === 'access_denied') return 'cancelled';
  return 'generic';
}

const MESSAGES: Record<GoogleSignInFailure, string> = {
  'cancelled': GOOGLE_CANCELLED_MESSAGE,
  'link-refused': GOOGLE_LINK_REFUSED_MESSAGE,
  'email-unverified': GOOGLE_EMAIL_UNVERIFIED_MESSAGE,
  'generic': GOOGLE_GENERIC_MESSAGE,
};

/** Never echoes the raw provider text. Accepts parameters or an already-classified failure. */
export function googleSignInErrorMessage(input: OAuthErrorParams | GoogleSignInFailure | null | undefined): string {
  const failure = typeof input === 'string' ? input : classifyGoogleSignInError(input);
  return MESSAGES[failure] ?? GOOGLE_GENERIC_MESSAGE;
}

/**
 * True only for an account GoTrue created through Google that has no age consent yet.
 * Keys on `app_metadata.provider`, which only GoTrue sets and is not changed by a later link, so a
 * password account that adds Google, or one whose user_metadata claims Google, is never pushed in.
 */
export function needsGoogleSignupFinish(
  user: {app_metadata?: {provider?: unknown; [key: string]: unknown} | null} | null | undefined,
  access: {ageConsent?: unknown} | null | undefined,
): boolean {
  if (!user || !access) return false;
  return user.app_metadata?.provider === 'google' && access.ageConsent === false;
}
