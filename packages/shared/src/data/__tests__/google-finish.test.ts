const rpc = jest.fn();
jest.mock('../../supabase/client', () => ({supabase: {rpc: (...args: unknown[]) => rpc(...args)}}));
import {subscribeAccountAgeChanges} from '../account-age';
import {finishGoogleSignup, subscribeProcessingAccessChanges, type ProcessingAccess} from '../processing-access';

// A Google account straight after sign-up: no permission, no birthday.
const before: ProcessingAccess = {
  contractVersion: 1, userId: 'owner-a', ageVersion: 0, consentVersion: 0,
  authorityVersion: 0, mailboxVersion: 1, ageEligible: false,
  canReadDebrief: false, canGenerateDebrief: false, authorityState: 'not-required',
  ageConsent: false, aiConsent: false,
};
const afterAccess: ProcessingAccess = {...before, ageVersion: 1, consentVersion: 1, ageEligible: true, ageConsent: true};
const afterAge = {
  userId: 'owner-a', birthDate: '2000-01-01', pendingBirthDate: null, correctionPending: false,
  adultDeclared: true, trackerWritesPaused: false, version: 1,
};
const ok = (access: unknown = afterAccess, age: unknown = afterAge) => ({data: {access, age}, error: null});
beforeEach(() => rpc.mockReset().mockResolvedValue(ok()));

it('saves the permission and the birthday in one call, with the captured revisions', async () => {
  const result = await finishGoogleSignup('2000-01-01', before);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('finish_google_signup', {
    p_birth_date: '2000-01-01', p_notice_version: '2026-10-20-age-v1', p_expected_user_id: 'owner-a',
    p_expected_age_version: 0, p_expected_consent_version: 0, p_expected_authority_version: 0,
    p_expected_mailbox_version: 1,
  });
  expect(result.access).toEqual(afterAccess);
  expect(result.age).toEqual(afterAge);
});

it('works for an account that already gave permission (half-finished by the old screen)', async () => {
  const half = {...before, consentVersion: 1, ageConsent: true};
  await finishGoogleSignup('2000-01-01', half);
  expect(rpc).toHaveBeenCalledWith('finish_google_signup', expect.objectContaining({p_expected_consent_version: 1}));
});

it.each(['', 'not-a-date', '2000-13-40', '2999-01-01'])('refuses the birthday %p before calling the server', async date => {
  await expect(finishGoogleSignup(date, before)).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});

it('refuses an incomplete expected status before calling the server', async () => {
  await expect(finishGoogleSignup('2000-01-01', {} as ProcessingAccess)).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});

it('passes a server refusal through unchanged', async () => {
  const refusal = Object.assign(new Error('Processing access changed. Refresh your choices.'), {code: 'EP002'});
  rpc.mockResolvedValue({data: null, error: refusal});
  await expect(finishGoogleSignup('2000-01-01', before)).rejects.toBe(refusal);
});

it.each([
  ['null data', null],
  ['no access part', {age: afterAge}],
  ['no age part', {access: afterAccess}],
  ['access for another account', {access: {...afterAccess, userId: 'owner-b'}, age: afterAge}],
  ['age for another account', {access: afterAccess, age: {...afterAge, userId: 'owner-b'}}],
  ['permission not saved', {access: {...afterAccess, ageConsent: false}, age: afterAge}],
  ['a different birthday saved', {access: afterAccess, age: {...afterAge, birthDate: '1999-05-05'}}],
  ['no birthday saved', {access: afterAccess, age: {...afterAge, birthDate: null}}],
  ['authority changed meanwhile', {access: {...afterAccess, authorityVersion: 1}, age: afterAge}],
  ['mailbox changed meanwhile', {access: {...afterAccess, mailboxVersion: 2}, age: afterAge}],
  ['malformed age', {access: afterAccess, age: {userId: 'owner-a'}}],
])('rejects a result with %s', async (_label, data) => {
  rpc.mockResolvedValue({data, error: null});
  await expect(finishGoogleSignup('2000-01-01', before)).rejects.toThrow();
});

it('tells both kinds of observers only after an accepted finish', async () => {
  const access = jest.fn(); const age = jest.fn();
  const stopA = subscribeProcessingAccessChanges(access); const stopB = subscribeAccountAgeChanges(age);
  const stopBad = subscribeAccountAgeChanges(() => { throw new Error('observer'); });
  try {
    rpc.mockResolvedValueOnce({data: null, error: new Error('offline')});
    await expect(finishGoogleSignup('2000-01-01', before)).rejects.toThrow();
    expect(access).not.toHaveBeenCalled(); expect(age).not.toHaveBeenCalled();
    await finishGoogleSignup('2000-01-01', before);
    expect(access).toHaveBeenCalledTimes(1); expect(age).toHaveBeenCalledTimes(1);
  } finally { stopA(); stopB(); stopBad(); }
});
