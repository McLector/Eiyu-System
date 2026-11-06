import { redirectSystemPath } from '../../app/+native-intent';

jest.mock('expo-linking', () => ({ createURL: () => 'eiyusystem-dev://auth/recovery' }));

// Inert fixtures, never real credentials.
const CODE = 'oauth-code-fixture';

describe('the Google callback deep link', () => {
  it.each([true, false])('is sent to the root and the code goes no further (initial=%s)', initial => {
    const route = redirectSystemPath({ path: `eiyusystem-dev://auth/callback?code=${CODE}`, initial });
    expect(route).toBe('/');
    expect(route).not.toContain(CODE);
  });

  it.each([
    'eiyusystem://auth/callback?code=x',
    'eiyusystem-preview://auth/callback?code=x',
    '/auth/callback?code=x',
    'eiyusystem-dev://auth/callback#error=access_denied',
    'eiyusystem-dev://auth/callback',
    'eiyusystem-dev://192.168.1.20:8081/auth/callback?code=x',
  ])('drops %s without a route of its own', path => {
    expect(redirectSystemPath({ path, initial: false })).toBe('/');
  });

  it('leaves password recovery and ordinary links alone', () => {
    expect(redirectSystemPath({ path: '/history', initial: false })).toBe('/history');
    expect(redirectSystemPath({ path: 'eiyusystem-dev://auth/recovery#type=recovery', initial: false })).toMatch(/^\/auth\/recovery\?attempt=\d+$/);
  });

  it('does not treat a longer path as the callback', () => {
    expect(redirectSystemPath({ path: '/auth/callback-other', initial: false })).toBe('/auth/callback-other');
  });
});
