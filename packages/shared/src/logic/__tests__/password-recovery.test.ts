import { parseRecoveryLink, beginPasswordRecovery, saveRecoveredPassword } from '../password-recovery';

const target = 'https://eiyusystem.app/auth/recovery';
// Deliberately inert strings: no real token or password is used in these unit fixtures.
const link = `${target}#type=recovery&token_type=bearer&access_token=test-access&refresh_token=test-refresh`;
const tokens = {access_token: 'test-access', refresh_token: 'test-refresh'};
function fixture() {
 const auth = {
  setSession: jest.fn().mockResolvedValue({data: {user: {id: 'owner'}, session: {user: {id: 'owner'}}}, error: null}),
  getUser: jest.fn().mockResolvedValue({data: {user: {id: 'owner'}}, error: null}),
  updateUser: jest.fn().mockResolvedValue({data: {user: {id: 'owner'}}, error: null}),
  signOut: jest.fn().mockResolvedValue({error: null}),
 };
 const currentOwner = jest.fn().mockResolvedValue(null);
 return {auth, currentOwner};
}

it('accepts only an exact callback target with complete recovery credentials', () => {
 expect(parseRecoveryLink(link, target)).toEqual(tokens);
 expect(parseRecoveryLink('eiyusystem-dev://auth/recovery#type=recovery&token_type=bearer&access_token=test-access&refresh_token=test-refresh', 'eiyusystem-dev://auth/recovery')).toEqual(tokens);
});
it.each([
 'https://elsewhere.test/auth/recovery#type=recovery&access_token=x&refresh_token=y',
 `${target}/extra#type=recovery&access_token=x&refresh_token=y`,
 `${target}#type=signup&access_token=x&refresh_token=y`,
 `${target}#type=recovery&access_token=x`,
 `${target}#type=recovery&access_token=x&refresh_token=y&access_token=z`,
 `${target}?code=test-code`,
 `${target}#error=access_denied&error_description=private-detail`,
 target,
 'not a URL',
])('rejects unsupported or malformed recovery input without echoing it', raw => {
 expect(() => parseRecoveryLink(raw, target)).toThrow('This recovery link is invalid or expired. Request a new link.');
});
it('validates the isolated recovery session before accepting its owner', async () => {
 const {auth, currentOwner} = fixture();
 await expect(beginPasswordRecovery(auth, tokens, currentOwner)).resolves.toBe('owner');
 expect(auth.setSession).toHaveBeenCalledWith(tokens);
});
it('rejects an invalid session without exposing the provider error', async () => {
 const {auth, currentOwner} = fixture();
 auth.setSession.mockResolvedValue({data: {user: null, session: null}, error: new Error('private-token-detail')});
 await expect(beginPasswordRecovery(auth, tokens, currentOwner)).rejects.toThrow('This recovery link is invalid or expired. Request a new link.');
});
it('rejects a different signed-in owner after the asynchronous link validation', async () => {
 const {auth, currentOwner} = fixture(); currentOwner.mockResolvedValue('other');
 await expect(beginPasswordRecovery(auth, tokens, currentOwner)).rejects.toThrow('Sign out of the other account before opening this recovery link.');
 expect(auth.updateUser).not.toHaveBeenCalled();
});
it.each([['short', 'short', 'Password must be at least 6 characters.'], ['Long-test-password-1', 'different', 'Passwords do not match.']])('rejects invalid new password input before calling Auth', async (password, confirmation, message) => {
 const {auth, currentOwner} = fixture();
 await expect(saveRecoveredPassword(auth, 'owner', password, confirmation, currentOwner)).rejects.toThrow(message);
 expect(auth.getUser).not.toHaveBeenCalled(); expect(auth.updateUser).not.toHaveBeenCalled();
});
it('denies an expired recovery session before updating a password', async () => {
 const {auth, currentOwner} = fixture(); auth.getUser.mockResolvedValue({data: {user: null}, error: new Error('expired')});
 await expect(saveRecoveredPassword(auth, 'owner', 'Long-test-password-1', 'Long-test-password-1', currentOwner)).rejects.toThrow('This recovery link is invalid or expired. Request a new link.');
 expect(auth.updateUser).not.toHaveBeenCalled();
});
it('denies an account switch during the session recheck', async () => {
 const {auth, currentOwner} = fixture();
 auth.getUser.mockImplementation(async () => {currentOwner.mockResolvedValue('other'); return {data: {user: {id: 'owner'}}, error: null};});
 await expect(saveRecoveredPassword(auth, 'owner', 'Long-test-password-1', 'Long-test-password-1', currentOwner)).rejects.toThrow(/other account/);
 expect(auth.updateUser).not.toHaveBeenCalled();
});
it('keeps a rejected update retryable and never reports success', async () => {
 const {auth, currentOwner} = fixture(); auth.updateUser.mockResolvedValue({data: {user: null}, error: new Error('private detail')});
 await expect(saveRecoveredPassword(auth, 'owner', 'Long-test-password-1', 'Long-test-password-1', currentOwner)).rejects.toThrow('Your password could not be updated. Try again or request a new recovery link.');
 expect(auth.signOut).not.toHaveBeenCalled();
});
it('updates only the isolated recovered account and ends that session locally', async () => {
 const {auth, currentOwner} = fixture();
 await expect(saveRecoveredPassword(auth, 'owner', 'Long-test-password-1', 'Long-test-password-1', currentOwner)).resolves.toEqual({cleanupFailed: false});
 expect(auth.updateUser).toHaveBeenCalledWith({password: 'Long-test-password-1'});
 expect(auth.signOut).toHaveBeenCalledWith({scope: 'local'});
});
it('reports a saved password separately from a failed session cleanup', async () => {
 const {auth, currentOwner} = fixture(); auth.signOut.mockResolvedValue({error: new Error('offline')});
 await expect(saveRecoveredPassword(auth, 'owner', 'Long-test-password-1', 'Long-test-password-1', currentOwner)).resolves.toEqual({cleanupFailed: true});
 expect(auth.updateUser).toHaveBeenCalledTimes(1);
});
