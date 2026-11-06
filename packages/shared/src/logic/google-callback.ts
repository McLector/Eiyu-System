import {
  GOOGLE_GENERIC_MESSAGE,
  classifyGoogleSignInError,
  googleSignInErrorMessage,
  readOAuthErrorParams,
} from './google-auth';

/**
 * The platform-independent half of a Google sign-in: turning the callback URL into a session on
 * the app's own client. Web and mobile both start the redirect themselves (different PKCE clients,
 * different redirect URLs) and hand the returned URL to `completeGoogleCallback`.
 */

/** The slice of a PKCE client that trades the callback code for tokens. */
export interface GoogleCodeExchanger {
  exchangeCodeForSession(code: string): Promise<{
    data: { session: { access_token: string; refresh_token: string; user: { id: string } } | null };
    error: unknown;
  }>;
}

/** The slice of the app's own Auth client that takes over the session. */
export interface AppSessionClient {
  getSession(): Promise<{ data: { session: { user: { id: string } } | null } }>;
  setSession(tokens: { access_token: string; refresh_token: string }): Promise<{ data: { session: unknown | null }; error: unknown }>;
  signOut(options: { scope: 'local' }): Promise<{ error: unknown }>;
}

export type GoogleCallbackResult = { ok: true } | { ok: false; message: string; cancelled: boolean };

// One exchange per code. React StrictMode runs effects twice, and a code can be used only once.
const handled = new Map<string, Promise<GoogleCallbackResult>>();
export const resetGoogleCallbackMemory = () => handled.clear();

const failure = (message: string, cancelled = false): GoogleCallbackResult => ({ ok: false, message, cancelled });

async function finish(code: string, oauth: GoogleCodeExchanger, main: AppSessionClient): Promise<GoogleCallbackResult> {
  try {
    const { data, error } = await oauth.exchangeCodeForSession(code);
    const session = data?.session;
    if (error || !session?.access_token || !session.refresh_token || !session.user?.id) return failure(GOOGLE_GENERIC_MESSAGE);
    // Account-switch hygiene: another account's local session must not carry over into this one.
    const existing = (await main.getSession()).data.session;
    if (existing && existing.user.id !== session.user.id) await main.signOut({ scope: 'local' });
    const set = await main.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (set.error || !set.data.session) return failure(GOOGLE_GENERIC_MESSAGE);
    return { ok: true };
  } catch { return failure(GOOGLE_GENERIC_MESSAGE); }
}

/** Turns the callback URL into a session, or into a message safe to show. Never retries a code. */
export function completeGoogleCallback(
  href: string,
  clients: { oauth: GoogleCodeExchanger; main: AppSessionClient },
): Promise<GoogleCallbackResult> {
  const errorParams = readOAuthErrorParams(href);
  if (errorParams) {
    return Promise.resolve(failure(googleSignInErrorMessage(errorParams), classifyGoogleSignInError(errorParams) === 'cancelled'));
  }
  let code = '';
  try { code = (new URL(href, 'http://placeholder.invalid').searchParams.get('code') ?? '').trim(); } catch { /* falls through */ }
  if (!code) return Promise.resolve(failure(GOOGLE_GENERIC_MESSAGE));
  let pending = handled.get(code);
  if (!pending) {
    pending = finish(code, clients.oauth, clients.main);
    handled.set(code, pending);
  }
  return pending;
}

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Keeps only the PKCE verifier (it must survive the redirect). A session is never written. */
export function createVerifierOnlyStorage(store: KeyValueStore) {
  const keep = (key: string) => key.endsWith('-code-verifier');
  return {
    getItem: (key: string) => (keep(key) ? store.getItem(key) : null),
    setItem: (key: string, value: string) => { if (keep(key)) store.setItem(key, value); },
    removeItem: (key: string) => { if (keep(key)) store.removeItem(key); },
  };
}
