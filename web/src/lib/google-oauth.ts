import { createClient } from '@supabase/supabase-js';
import {
  GOOGLE_GENERIC_MESSAGE,
  createVerifierOnlyStorage,
  type GoogleCodeExchanger,
} from '@eiyu/shared';

// The callback half is shared with mobile.
export {
  completeGoogleCallback,
  createVerifierOnlyStorage,
  resetGoogleCallbackMemory,
  type AppSessionClient,
  type GoogleCallbackResult,
} from '@eiyu/shared';

export const GOOGLE_CALLBACK_PATH = '/auth/callback';
const OAUTH_STORAGE_KEY = 'eiyu-google-oauth';

export const googleRedirectUrl = (origin: string) => `${origin}${GOOGLE_CALLBACK_PATH}`;

/** The slice of the Auth client that starts and finishes a PKCE sign-in. */
export interface GoogleOAuthClient extends GoogleCodeExchanger {
  signInWithOAuth(credentials: {
    provider: 'google';
    options: { redirectTo: string; queryParams: Record<string, string> };
  }): Promise<{ data: unknown; error: unknown }>;
}

/**
 * Starts the Google redirect. No `scopes`: GoTrue already asks Google for email and profile, and a
 * duplicate made Google answer `invalid_scope` (T4). `select_account` stops a shared browser from
 * silently reusing the last Google account.
 */
export async function startGoogleSignIn(oauth: Pick<GoogleOAuthClient, 'signInWithOAuth'>, origin: string): Promise<void> {
  let failed = false;
  try {
    const { error } = await oauth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: googleRedirectUrl(origin), queryParams: { prompt: 'select_account' } },
    });
    failed = !!error;
  } catch { failed = true; }
  // Raw provider text never reaches the screen.
  if (failed) throw new Error(GOOGLE_GENERIC_MESSAGE);
}

let oauthClient: ReturnType<typeof createClient>['auth'] | null = null;
/**
 * A PKCE client used only for Google. The app client keeps the default flow because password
 * recovery links carry tokens in the hash. Lazy, so importing this file reads no environment.
 */
export function getGoogleOAuthClient() {
  if (!oauthClient) {
    oauthClient = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',
        storageKey: OAUTH_STORAGE_KEY,
        storage: createVerifierOnlyStorage(window.localStorage),
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }).auth;
  }
  return oauthClient;
}
