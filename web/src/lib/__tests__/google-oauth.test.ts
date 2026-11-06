import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_CALLBACK_PATH,
  completeGoogleCallback,
  createVerifierOnlyStorage,
  googleRedirectUrl,
  resetGoogleCallbackMemory,
  startGoogleSignIn,
} from '../google-oauth';
import {
  GOOGLE_CANCELLED_MESSAGE,
  GOOGLE_GENERIC_MESSAGE,
  GOOGLE_LINK_REFUSED_MESSAGE,
} from '@eiyu/shared';

const SESSION = { access_token: 'access-1', refresh_token: 'refresh-1', user: { id: 'user-1' } };

function deps(overrides: { existing?: { user: { id: string } } | null } = {}) {
  const oauth = {
    signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: 'https://accounts.example/x' }, error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: SESSION }, error: null }),
  };
  const main = {
    getSession: vi.fn().mockResolvedValue({ data: { session: overrides.existing ?? null }, error: null }),
    setSession: vi.fn().mockResolvedValue({ data: { session: SESSION }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  return { oauth, main };
}

beforeEach(() => resetGoogleCallbackMemory());

describe('googleRedirectUrl', () => {
  it('points at the callback route on the current origin', () => {
    expect(GOOGLE_CALLBACK_PATH).toBe('/auth/callback');
    expect(googleRedirectUrl('https://app.example')).toBe('https://app.example/auth/callback');
  });
});

describe('startGoogleSignIn', () => {
  it('asks for Google with the callback redirect, no explicit scopes, and an account picker', async () => {
    const { oauth } = deps();
    await startGoogleSignIn(oauth, 'https://app.example');
    expect(oauth.signInWithOAuth).toHaveBeenCalledTimes(1);
    const arg = oauth.signInWithOAuth.mock.calls[0][0];
    expect(arg.provider).toBe('google');
    expect(arg.options.redirectTo).toBe('https://app.example/auth/callback');
    // GoTrue already sends email+profile; a duplicate scope made Google answer invalid_scope (T4).
    expect(arg.options).not.toHaveProperty('scopes');
    expect(arg.options.queryParams).toEqual({ prompt: 'select_account' });
  });

  it('throws the generic message when Supabase reports an error', async () => {
    const { oauth } = deps();
    oauth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: new Error('provider is not enabled') });
    await expect(startGoogleSignIn(oauth, 'https://app.example')).rejects.toThrow(GOOGLE_GENERIC_MESSAGE);
  });

  it('throws the generic message, never the raw error, when the call rejects', async () => {
    const { oauth } = deps();
    oauth.signInWithOAuth.mockRejectedValue(new Error('secret internal detail'));
    await expect(startGoogleSignIn(oauth, 'https://app.example')).rejects.toThrow(GOOGLE_GENERIC_MESSAGE);
  });
});

describe('completeGoogleCallback', () => {
  it('exchanges the code and hands the tokens to the app client', async () => {
    const { oauth, main } = deps();
    const result = await completeGoogleCallback('https://app.example/auth/callback?code=abc', { oauth, main });
    expect(result).toEqual({ ok: true });
    expect(oauth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(main.setSession).toHaveBeenCalledWith({ access_token: 'access-1', refresh_token: 'refresh-1' });
  });

  it('maps the real refused-link shape to the combined message and never exchanges', async () => {
    const { oauth, main } = deps();
    const url = 'https://app.example/auth/callback?error=server_error&error_code=unexpected_failure&error_description=Error+creating+identity';
    const result = await completeGoogleCallback(url, { oauth, main });
    expect(result).toEqual({ ok: false, message: GOOGLE_LINK_REFUSED_MESSAGE, cancelled: false });
    expect(oauth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(main.setSession).not.toHaveBeenCalled();
  });

  it('reads the error from the hash too', async () => {
    const { oauth, main } = deps();
    const url = 'https://app.example/auth/callback#error=server_error&error_code=unexpected_failure&error_description=Error+creating+identity';
    expect(await completeGoogleCallback(url, { oauth, main })).toMatchObject({ ok: false, message: GOOGLE_LINK_REFUSED_MESSAGE });
  });

  it('treats a cancel as a neutral, flagged result', async () => {
    const { oauth, main } = deps();
    const result = await completeGoogleCallback('https://app.example/auth/callback?error=access_denied', { oauth, main });
    expect(result).toEqual({ ok: false, message: GOOGLE_CANCELLED_MESSAGE, cancelled: true });
  });

  it('prefers the error over a code when both arrive', async () => {
    const { oauth, main } = deps();
    const result = await completeGoogleCallback('https://app.example/auth/callback?code=abc&error=access_denied', { oauth, main });
    expect(result).toMatchObject({ ok: false, cancelled: true });
    expect(oauth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('fails generically when the code is missing, blank or the URL is empty', async () => {
    for (const url of ['https://app.example/auth/callback', 'https://app.example/auth/callback?code=', 'https://app.example/auth/callback?code=%20', '']) {
      const { oauth, main } = deps();
      expect(await completeGoogleCallback(url, { oauth, main })).toEqual({ ok: false, message: GOOGLE_GENERIC_MESSAGE, cancelled: false });
      expect(oauth.exchangeCodeForSession).not.toHaveBeenCalled();
    }
  });

  it('fails generically on a replayed or expired code and sets no session', async () => {
    const { oauth, main } = deps();
    oauth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: new Error('invalid flow state, no valid flow state found') });
    const result = await completeGoogleCallback('https://app.example/auth/callback?code=old', { oauth, main });
    expect(result).toEqual({ ok: false, message: GOOGLE_GENERIC_MESSAGE, cancelled: false });
    expect(main.setSession).not.toHaveBeenCalled();
  });

  it('fails generically when the exchange throws or returns no session', async () => {
    const thrown = deps();
    thrown.oauth.exchangeCodeForSession.mockRejectedValue(new Error('network'));
    expect(await completeGoogleCallback('https://app.example/auth/callback?code=a', thrown)).toMatchObject({ ok: false, message: GOOGLE_GENERIC_MESSAGE });
    resetGoogleCallbackMemory();
    const empty = deps();
    empty.oauth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await completeGoogleCallback('https://app.example/auth/callback?code=b', empty)).toMatchObject({ ok: false, message: GOOGLE_GENERIC_MESSAGE });
    expect(empty.main.setSession).not.toHaveBeenCalled();
  });

  it('fails generically when the app client refuses the tokens', async () => {
    const { oauth, main } = deps();
    main.setSession.mockResolvedValue({ data: { session: null }, error: new Error('bad token') });
    expect(await completeGoogleCallback('https://app.example/auth/callback?code=abc', { oauth, main })).toMatchObject({ ok: false, message: GOOGLE_GENERIC_MESSAGE });
  });

  it('runs the exchange once when the same code is handled twice at the same time', async () => {
    const { oauth, main } = deps();
    const url = 'https://app.example/auth/callback?code=same';
    const [a, b] = await Promise.all([completeGoogleCallback(url, { oauth, main }), completeGoogleCallback(url, { oauth, main })]);
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(oauth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(main.setSession).toHaveBeenCalledTimes(1);
  });

  it('does not retry a code that already failed', async () => {
    const { oauth, main } = deps();
    oauth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: new Error('used') });
    const url = 'https://app.example/auth/callback?code=once';
    await completeGoogleCallback(url, { oauth, main });
    await completeGoogleCallback(url, { oauth, main });
    expect(oauth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it('drops a different account\'s local session before taking the new one', async () => {
    const { oauth, main } = deps({ existing: { user: { id: 'someone-else' } } });
    const order: string[] = [];
    main.signOut.mockImplementation(async () => { order.push('signOut'); return { error: null }; });
    main.setSession.mockImplementation(async () => { order.push('setSession'); return { data: { session: SESSION }, error: null }; });
    expect(await completeGoogleCallback('https://app.example/auth/callback?code=abc', { oauth, main })).toEqual({ ok: true });
    expect(main.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(order).toEqual(['signOut', 'setSession']);
  });

  it('keeps the existing session when the same account signs in again', async () => {
    const { oauth, main } = deps({ existing: { user: { id: 'user-1' } } });
    expect(await completeGoogleCallback('https://app.example/auth/callback?code=abc', { oauth, main })).toEqual({ ok: true });
    expect(main.signOut).not.toHaveBeenCalled();
  });
});

describe('createVerifierOnlyStorage', () => {
  function backing() {
    const data = new Map<string, string>();
    return {
      data,
      store: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => { data.set(k, v); },
        removeItem: (k: string) => { data.delete(k); },
      },
    };
  }

  it('keeps the PKCE code verifier so it survives the redirect', async () => {
    const { data, store } = backing();
    const storage = createVerifierOnlyStorage(store);
    await storage.setItem('eiyu-google-oauth-code-verifier', 'verifier');
    expect(data.get('eiyu-google-oauth-code-verifier')).toBe('verifier');
    expect(await storage.getItem('eiyu-google-oauth-code-verifier')).toBe('verifier');
    await storage.removeItem('eiyu-google-oauth-code-verifier');
    expect(data.size).toBe(0);
  });

  it('never persists a session or tokens', async () => {
    const { data, store } = backing();
    const storage = createVerifierOnlyStorage(store);
    await storage.setItem('eiyu-google-oauth', JSON.stringify({ access_token: 'secret' }));
    await storage.setItem('eiyu-google-oauth-user', 'x');
    expect(data.size).toBe(0);
    expect(await storage.getItem('eiyu-google-oauth')).toBeNull();
  });
});
