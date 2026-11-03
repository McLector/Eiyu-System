import {consumeRecoveryLink, redirectRecoveryLink} from '../recovery-link';
import {RECOVERY_LINK_ERROR} from '@eiyu/shared';
import {redirectSystemPath} from '../../app/+native-intent';
import {extractExpoPathFromURL} from 'expo-router/build/fork/extractPathFromURL';
jest.mock('expo-linking', () => ({createURL: () => 'eiyusystem-dev://auth/recovery'}));

const target = 'eiyusystem-dev://auth/recovery';
// Inert unit fixtures, never actual Auth credentials.
const hash = '#type=recovery&token_type=bearer&access_token=test-access&refresh_token=test-refresh';
const idOf = (path: string) => new URL(path, 'https://local.test').searchParams.get('attempt') ?? undefined;
it.each([true, false])('hands off cold/warm native callbacks (initial=%s)', initial => {
 const route = redirectSystemPath({path: target + hash, initial});
 expect(route).toMatch(/^\/auth\/recovery\?attempt=\d+$/);
 expect(consumeRecoveryLink(idOf(route)).refresh_token).toBe('test-refresh');
});

it('captures credentials before the installed Router drops the fragment', () => {
 expect(extractExpoPathFromURL([], target + hash)).toBe('auth/recovery');
 const route = redirectRecoveryLink(target + hash, target);
 expect(route).toMatch(/^\/auth\/recovery\?attempt=\d+$/);
 expect(consumeRecoveryLink(idOf(route))).toEqual({access_token: 'test-access', refresh_token: 'test-refresh'});
 expect(() => consumeRecoveryLink(idOf(route))).toThrow(RECOVERY_LINK_ERROR);
});
it.each(['', '#error=access_denied&error_description=private', hash + '&access_token=duplicate', '?access_token=private' + hash])('fails closed for invalid recovery input %s', suffix => {
 const route = redirectRecoveryLink(target + suffix, target);
 expect(route).not.toContain('private');
 expect(() => consumeRecoveryLink(idOf(route))).toThrow(RECOVERY_LINK_ERROR);
});
it('invalidates an older pending link when another recovery link arrives', () => {
 const old = redirectRecoveryLink(target + hash, target);
 const fresh = redirectRecoveryLink(target + hash, target);
 expect(() => consumeRecoveryLink(idOf(old))).toThrow(RECOVERY_LINK_ERROR);
 expect(consumeRecoveryLink(idOf(fresh)).access_token).toBe('test-access');
});
it.each(['eiyusystem-dev://board', 'eiyusystem://auth/recovery', 'https://example.test/auth/recovery', 'not a URL'])('leaves unrelated links unchanged: %s', path => {
 expect(redirectRecoveryLink(path, target)).toBe(path);
});
it('does not accept a direct route or an invented attempt', () => {
 expect(() => consumeRecoveryLink(undefined)).toThrow(RECOVERY_LINK_ERROR);
 expect(() => consumeRecoveryLink('invented')).toThrow(RECOVERY_LINK_ERROR);
});
