import * as Linking from 'expo-linking';
import {
  GOOGLE_GENERIC_MESSAGE,
  completeGoogleCallback,
  type AppSessionClient,
  type GoogleCodeExchanger,
} from '@eiyu/shared';

export const GOOGLE_CALLBACK_ROUTE = 'auth/callback';

/**
 * The deep link Google's round trip comes back to: `<scheme>://auth/callback`, one exact URL per build
 * variant (`eiyusystem`, `eiyusystem-dev`, `eiyusystem-preview`; see app.config.js and supabase/config.toml).
 *
 * `Linking.createURL` is read for the scheme only. In a development build served from Metro it can add the
 * dev server's host (`<scheme>://192.168.1.20:8081/auth/callback`), and that address changes, so it could
 * never sit on an exact allow-list. Expo Go and web give `exp://` / `https://` URLs, which this app does not
 * support for Google sign-in, so they are refused.
 */
export function googleRedirectUrl(createURL: (path: string) => string = Linking.createURL): string {
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(createURL(GOOGLE_CALLBACK_ROUTE))?.[1];
  if (!scheme || /^(exp|exps|http|https)$/i.test(scheme)) {
    throw new Error('Google sign-in needs an installed build of the app.');
  }
  return `${scheme}://${GOOGLE_CALLBACK_ROUTE}`;
}

/** The slice of the Google PKCE client that starts the sign-in and trades the code. */
export interface NativeGoogleOAuthClient extends GoogleCodeExchanger {
  signInWithOAuth(credentials: {
    provider: 'google';
    options: { redirectTo: string; skipBrowserRedirect: true; queryParams: Record<string, string> };
  }): Promise<{ data: { url?: string | null } | null; error: unknown }>;
}

/** The shapes `expo-web-browser`'s `openAuthSessionAsync` resolves with. */
export type AuthSessionResult = { type: 'success'; url?: string } | { type: 'cancel' | 'dismiss' | 'locked' | string; url?: string };

export interface NativeGoogleDeps {
  oauth: NativeGoogleOAuthClient;
  main: AppSessionClient;
  openAuthSession: (url: string, redirectUrl: string) => Promise<AuthSessionResult>;
  redirectTo: string;
}

export interface NativeGoogleResult {
  /** A message safe to show, or null. Raw provider text never reaches it. */
  error: string | null;
  /** The user closed the browser or declined Google's screen. Not an error, and not a retry loop. */
  cancelled: boolean;
}

const failed: NativeGoogleResult = { error: GOOGLE_GENERIC_MESSAGE, cancelled: false };
const quiet: NativeGoogleResult = { error: null, cancelled: true };

/**
 * Google sign-in on a phone: PKCE start without a page redirect, an in-app browser session on the same
 * redirect URL, then the shared code exchange. The code lives only in the value `openAuthSession` returns;
 * it is never routed, stored or logged, so a stale callback link with no flow waiting is simply not used.
 */
export async function runGoogleSignIn({ oauth, main, openAuthSession, redirectTo }: NativeGoogleDeps): Promise<NativeGoogleResult> {
  let authUrl: string | null | undefined;
  try {
    const { data, error } = await oauth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
    });
    authUrl = error ? null : data?.url;
  } catch { authUrl = null; }
  if (!authUrl) return failed;

  let result: AuthSessionResult;
  try { result = await openAuthSession(authUrl, redirectTo); } catch { return failed; }
  if (result.type === 'cancel' || result.type === 'dismiss') return quiet;
  if (result.type !== 'success' || !result.url) return failed;

  const outcome = await completeGoogleCallback(result.url, { oauth, main });
  if (outcome.ok) return { error: null, cancelled: false };
  return outcome.cancelled ? quiet : { error: outcome.message, cancelled: false };
}
