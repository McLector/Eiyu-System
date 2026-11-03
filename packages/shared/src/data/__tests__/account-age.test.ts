const rpc = jest.fn();
jest.mock('../../supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));
import { fetchAccountAge, setAccountBirthday, requireAdultDeclaration, subscribeAccountAgeChanges } from '../account-age';

const status = { userId: 'owner', birthDate: '2000-01-01', pendingBirthDate: null, correctionPending: false, adultDeclared: true, version: 1 };
beforeEach(() => rpc.mockReset().mockResolvedValue({ data: status, error: null }));
it('reads only the caller, without supplying an owner or trusting metadata', async () => {
  expect(await fetchAccountAge()).toEqual(status);
  expect(rpc).toHaveBeenCalledWith('get_account_age');
});
it('validates a correction before sending and returns server state', async () => {
  await expect(setAccountBirthday('2023-02-29')).rejects.toThrow('valid birthday');
  expect(rpc).not.toHaveBeenCalled();
  expect(await setAccountBirthday('2000-01-01')).toEqual(status);
  expect(rpc).toHaveBeenCalledWith('set_account_birthday', { p_birth_date: '2000-01-01' });
});
it.each([null, {}, { ...status, version: -1 }, { ...status, adultDeclared: 'true' }])('fails closed for invalid RPC state', async data => {
  rpc.mockResolvedValue({ data, error: null });
  await expect(requireAdultDeclaration()).rejects.toThrow();
});
it.each([{ ...status, adultDeclared: false }, { ...status, correctionPending: true }, { ...status, birthDate: null }])('denies missing, minor or pending declarations', async data => {
  rpc.mockResolvedValue({ data, error: null });
  await expect(requireAdultDeclaration()).rejects.toThrow();
});
it('preserves a read error instead of inferring eligibility', async () => {
  rpc.mockResolvedValue({ data: null, error: new Error('offline') });
  await expect(fetchAccountAge()).rejects.toThrow('offline');
});
it('notifies mounted AI consumers only after an accepted server response', async () => {
  const changed = jest.fn(); const stop = subscribeAccountAgeChanges(changed);
  rpc.mockResolvedValueOnce({ data: null, error: new Error('offline') });
  await expect(setAccountBirthday('2000-01-01')).rejects.toThrow('offline');
  expect(changed).not.toHaveBeenCalled();
  await setAccountBirthday('2000-01-01'); expect(changed).toHaveBeenCalledTimes(1);
  stop(); await setAccountBirthday('2000-01-01'); expect(changed).toHaveBeenCalledTimes(1);
});
it('binds a Profile correction to the account that opened the editor', async () => {
  await setAccountBirthday('2000-01-01', 'original-owner');
  expect(rpc).toHaveBeenCalledWith('set_account_birthday', { p_birth_date: '2000-01-01', p_expected_user_id: 'original-owner' });
});
it.each(['false', 0, null])('rejects malformed tracker-pause state instead of accepting it as access: %s', async trackerWritesPaused => {
  rpc.mockResolvedValue({ data: { ...status, trackerWritesPaused }, error: null });
  await expect(fetchAccountAge()).rejects.toThrow('Birthday status is unavailable.');
});
