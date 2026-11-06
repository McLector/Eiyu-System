import {
  GOOGLE_CANCELLED_MESSAGE,
  GOOGLE_GENERIC_MESSAGE,
  GOOGLE_LINK_REFUSED_MESSAGE,
  resetGoogleCallbackMemory,
} from '@eiyu/shared';

import { googleRedirectUrl, runGoogleSignIn } from '../google-oauth';

const REDIRECT = 'eiyusystem-dev://auth/callback';
const SESSION = { access_token: 'access-1', refresh_token: 'refresh-1', user: { id: 'user-1' } };

function deps(overrides: { existing?: { user: { id: string } } | null } = {}) {
  const oauth = {
    signInWithOAuth: jest.fn().mockResolvedValue({ data: { url: 'https://accounts.example/start' }, error: null }),
    exchangeCodeForSession: jest.fn().mockResolvedValue({ data: { session: SESSION }, error: null }),
  };
  const main = {
    getSession: jest.fn().mockResolvedValue({ data: { session: overrides.existing ?? null } }),
    setSession: jest.fn().mockResolvedValue({ data: { session: SESSION }, error: null }),
    signOut: jest.fn().mockResolvedValue({ error: null }),
  };
  const openAuthSession = jest.fn().mockResolvedValue({ type: 'success', url: `${REDIRECT}?code=code-1` });
  return { oauth, main, openAuthSession, redirectTo: REDIRECT };
}

beforeEach(() => resetGoogleCallbackMemory());

describe('googleRedirectUrl', () => {
  it('uses the build scheme with the callback path', () => {
    expect(googleRedirectUrl(path => `eiyusystem-preview://${path}`)).toBe('eiyusystem-preview://auth/callback');
  });

  it('drops the dev server host that a development build adds, so one exact URL stays on the allow-list', () => {
    expect(googleRedirectUrl(path => `eiyusystem-dev://192.168.1.20:8081/${path}`)).toBe('eiyusystem-dev://auth/callback');
  });

  it('keeps the scheme of each variant', () => {
    for (const scheme of ['eiyusystem', 'eiyusystem-dev', 'eiyusystem-preview']) {
      expect(googleRedirectUrl(path => `${scheme}://${path}`)).toBe(`${scheme}://auth/callback`);
    }
  });

  it('refuses a URL that is not an installed-app scheme (Expo Go, web, empty)', () => {
    expect(() => googleRedirectUrl(path => `exp://192.168.1.20:8081/--/${path}`)).toThrow();
    expect(() => googleRedirectUrl(path => `https://example.test/${path}`)).toThrow();
    expect(() => googleRedirectUrl(() => '')).toThrow();
  });
});

describe('runGoogleSignIn', () => {
  it('starts without a browser redirect, opens the auth session on the same redirect URL, and takes over the session', async () => {
    const d = deps();
    await expect(runGoogleSignIn(d)).resolves.toEqual({ error: null, cancelled: false });
    expect(d.oauth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: REDIRECT, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
    });
    expect(d.openAuthSession).toHaveBeenCalledWith('https://accounts.example/start', REDIRECT);
    expect(d.oauth.exchangeCodeForSession).toHaveBeenCalledWith('code-1');
    expect(d.main.setSession).toHaveBeenCalledWith({ access_token: 'access-1', refresh_token: 'refresh-1' });
  });

  it('passes no scopes', async () => {
    const d = deps();
    await runGoogleSignIn(d);
    expect(JSON.stringify(d.oauth.signInWithOAuth.mock.calls[0][0])).not.toContain('scopes');
  });

  it.each(['cancel', 'dismiss'])('treats %s as a quiet return: signed out, no error, nothing exchanged', async type => {
    const d = deps();
    d.openAuthSession.mockResolvedValue({ type });
    await expect(runGoogleSignIn(d)).resolves.toEqual({ error: null, cancelled: true });
    expect(d.oauth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(d.main.setSession).not.toHaveBeenCalled();
  });

  it('shows the generic message when another auth session holds the browser (locked)', async () => {
    const d = deps();
    d.openAuthSession.mockResolvedValue({ type: 'locked' });
    await expect(runGoogleSignIn(d)).resolves.toEqual({ error: GOOGLE_GENERIC_MESSAGE, cancelled: false });
    expect(d.oauth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('shows the generic message and never opens a browser when the start fails (error or throw)', async () => {
    const failing = deps();
    failing.oauth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: new Error('provider is not enabled: secret detail') });
    await expect(runGoogleSignIn(failing)).resolves.toEqual({ error: GOOGLE_GENERIC_MESSAGE, cancelled: false });
    expect(failing.openAuthSession).not.toHaveBeenCalled();

    const throwing = deps();
    throwing.oauth.signInWithOAuth.mockRejectedValue(new Error('network down'));
    await expect(runGoogleSignIn(throwing)).resolves.toEqual({ error: GOOGLE_GENERIC_MESSAGE, cancelled: false });
    expect(throwing.openAuthSession).not.toHaveBeenCalled();
  });

  it('shows the generic message when the start returns no URL', async () => {
    const d = deps();
    d.oauth.signInWithOAuth.mockResolvedValue({ data: {}, error: null });
    await expect(runGoogleSignIn(d)).resolves.toEqual({ error: GOOGLE_GENERIC_MESSAGE, cancelled: false });
    expect(d.openAuthSession).not.toHaveBeenCalled();
  });

  it('shows the generic message when the browser throws', async () => {
    const d = deps();
    d.openAuthSession.mockRejectedValue(new Error('no custom tabs'));
    await expect(runGoogleSignIn(d)).resolves.toEqual({ error: GOOGLE_GENERIC_MESSAGE, cancelled: false });
  });

  it('maps a refused link to the combined message and creates no session', async () => {
    const d = deps();
    d.openAuthSession.mockResolvedValue({
      type: 'success',
      url: `${REDIRECT}?error=server_error&error_code=unexpected_failure&error_description=Error+creating+identity`,
    });
    await expect(runGoogleSignIn(d)).resolves.toEqual({ error: GOOGLE_LINK_REFUSED_MESSAGE, cancelled: false });
    expect(d.main.setSession).not.toHaveBeenCalled();
  });

  it('treats a denied Google consent screen as a quiet cancel', async () => {
    const d = deps();
    d.openAuthSession.mockResolvedValue({ type: 'success', url: `${REDIRECT}?error=access_denied&error_description=User+denied` });
    await expect(runGoogleSignIn(d)).resolves.toEqual({ error: null, cancelled: true });
    expect(GOOGLE_CANCELLED_MESSAGE).toBeTruthy();
    expect(d.oauth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('reads error parameters from the hash as well as the query', async () => {
    const d = deps();
    d.openAuthSession.mockResolvedValue({
      type: 'success',
      url: `${REDIRECT}#error=server_error&error_description=Error+creating+identity`,
    });
    await expect(runGoogleSignIn(d)).resolves.toEqual({ error: GOOGLE_LINK_REFUSED_MESSAGE, cancelled: false });
  });

  it('shows the generic message for a success URL with no code', async () => {
    const d = deps();
    d.openAuthSession.mockResolvedValue({ type: 'success', url: REDIRECT });
    await expect(runGoogleSignIn(d)).resolves.toEqual({ error: GOOGLE_GENERIC_MESSAGE, cancelled: false });
    expect(d.oauth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('shows the generic message for a success result with no URL at all', async () => {
    const d = deps();
    d.openAuthSession.mockResolvedValue({ type: 'success' });
    await expect(runGoogleSignIn(d)).resolves.toEqual({ error: GOOGLE_GENERIC_MESSAGE, cancelled: false });
  });

  it('shows the generic message and keeps the old session when the exchange fails', async () => {
    const d = deps();
    d.oauth.exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: new Error('bad verifier') });
    await expect(runGoogleSignIn(d)).resolves.toEqual({ error: GOOGLE_GENERIC_MESSAGE, cancelled: false });
    expect(d.main.setSession).not.toHaveBeenCalled();
    expect(d.main.signOut).not.toHaveBeenCalled();
  });

  it('clears another account\'s local session before taking over', async () => {
    const d = deps({ existing: { user: { id: 'someone-else' } } });
    await expect(runGoogleSignIn(d)).resolves.toEqual({ error: null, cancelled: false });
    expect(d.main.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(d.main.signOut.mock.invocationCallOrder[0]).toBeLessThan(d.main.setSession.mock.invocationCallOrder[0]);
  });

  it('does not sign out when the same account signs in again', async () => {
    const d = deps({ existing: { user: { id: 'user-1' } } });
    await runGoogleSignIn(d);
    expect(d.main.signOut).not.toHaveBeenCalled();
  });

  it('never exchanges the same code twice', async () => {
    const d = deps();
    await runGoogleSignIn(d);
    await runGoogleSignIn(d);
    expect(d.oauth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });

  it('never puts the raw provider text or the code on the screen', async () => {
    const d = deps();
    d.openAuthSession.mockResolvedValue({ type: 'success', url: `${REDIRECT}?error=server_error&error_description=Secret+provider+text+code-1` });
    const result = await runGoogleSignIn(d);
    expect(result.error).toBe(GOOGLE_GENERIC_MESSAGE);
    expect(JSON.stringify(result)).not.toContain('Secret');
  });
});

describe('the real Linking.createURL', () => {
  const variants: [string, string][] = [
    ['eiyusystem', 'eiyusystem'],
    ['eiyusystem-dev', 'eiyusystem-dev'],
    ['eiyusystem-preview', 'eiyusystem-preview'],
  ];

  it.each(variants)('gives the allow-listed URL for %s, with and without a Metro host', (scheme, expected) => {
    for (const hostUri of [undefined, '192.168.1.20:8081']) {
      jest.isolateModules(() => {
        jest.doMock('expo-constants', () => ({
          __esModule: true,
          default: { executionEnvironment: 'bare', expoConfig: { scheme, ...(hostUri ? { hostUri } : {}) } },
          ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
        }));
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Linking = require('expo-linking') as typeof import('expo-linking');
        expect(googleRedirectUrl(Linking.createURL)).toBe(`${expected}://auth/callback`);
      });
    }
  });
});
