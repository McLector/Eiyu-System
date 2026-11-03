const rpc = jest.fn();
jest.mock('../../supabase/client', () => ({supabase: {rpc: (...args: unknown[]) => rpc(...args)}}));
import {
  fetchProcessingAccess, requireDebriefAccess, setProcessingConsent,
  subscribeProcessingAccessChanges, type ProcessingAccess,
} from '../processing-access';

const allowed: ProcessingAccess = {
  contractVersion: 1, userId: 'owner-a', ageVersion: 2, consentVersion: 3,
  authorityVersion: 4, mailboxVersion: 5, ageEligible: true,
  canReadDebrief: true, canGenerateDebrief: true, authorityState: 'not-required',
  ageConsent: true, aiConsent: true,
};
beforeEach(() => rpc.mockReset().mockResolvedValue({data: {...allowed}, error: null}));

it('reads caller-scoped state without supplying an owner or metadata', async () => {
  expect(await fetchProcessingAccess()).toEqual(allowed);
  expect(rpc).toHaveBeenCalledWith('get_processing_access');
});
it('returns only the access contract, without retaining extra verification data', async () => {
  rpc.mockResolvedValue({data: {...allowed, unexpectedSensitiveField: 'synthetic-do-not-retain'}, error: null});
  expect(await fetchProcessingAccess()).toEqual(allowed);
});
it.each(Object.keys(allowed))('rejects a missing %s instead of accepting old capability', async key => {
  const value: Record<string, unknown> = {...allowed}; delete value[key];
  rpc.mockResolvedValue({data: value, error: null});
  await expect(fetchProcessingAccess()).rejects.toThrow();
});
it.each([null, [], 'allowed', {}, {userId: 'owner-a', adultDeclared: true, version: 2}])(
  'rejects malformed or legacy responses %#', async data => {
    rpc.mockResolvedValue({data, error: null});
    await expect(requireDebriefAccess('generate')).rejects.toThrow();
  });
it.each(['ageVersion', 'consentVersion', 'authorityVersion', 'mailboxVersion'] as const)(
  'rejects invalid %s revisions', async key => {
    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', null, NaN]) {
      rpc.mockResolvedValue({data: {...allowed, [key]: value}, error: null});
      await expect(fetchProcessingAccess()).rejects.toThrow();
    }
  });
it.each(['ageEligible', 'ageConsent', 'aiConsent', 'canReadDebrief', 'canGenerateDebrief'] as const)(
  'does not coerce the %s decision', async key => {
    for (const value of [0, 1, 'true', null]) {
      rpc.mockResolvedValue({data: {...allowed, [key]: value}, error: null});
      await expect(fetchProcessingAccess()).rejects.toThrow();
    }
  });
it.each([
  {contractVersion: 2}, {contractVersion: '1'}, {userId: ''}, {userId: '  '},
  {authorityState: 'self-approved'}, {authorityState: null},
  {ageEligible: false}, {ageConsent: false}, {aiConsent: false},
  {canReadDebrief: false}, {authorityState: 'pending'}, {authorityState: 'revoked'},
])('rejects unsupported or contradictory positive access %#', async override => {
  rpc.mockResolvedValue({data: {...allowed, ...override}, error: null});
  await expect(fetchProcessingAccess()).rejects.toThrow();
});
it('accepts explicitly denied state without inventing eligibility from an adult fact', async () => {
  const denied = {...allowed, ageEligible: false, canReadDebrief: false, canGenerateDebrief: false};
  rpc.mockResolvedValue({data: {...denied, adultDeclared: true}, error: null});
  expect(await fetchProcessingAccess()).toEqual(denied);
  await expect(requireDebriefAccess('read')).rejects.toThrow();
  await expect(requireDebriefAccess('generate')).rejects.toThrow();
});
it('allows saved reads after AI generation withdrawal without allowing new inference', async () => {
  const readOnly = {...allowed, aiConsent: false, canGenerateDebrief: false};
  rpc.mockResolvedValue({data: readOnly, error: null});
  expect(await requireDebriefAccess('read')).toEqual(readOnly);
  await expect(requireDebriefAccess('generate')).rejects.toThrow();
});
it.each(['not-required', 'approved'] as const)('uses server-computed access with %s authority, without requesting DOB or IDs', async authorityState => {
  rpc.mockResolvedValue({data: {...allowed, authorityState}, error: null});
  expect(await requireDebriefAccess('generate')).toEqual({...allowed, authorityState});
});
it.each(['pending', 'revoked'] as const)('denies %s authority even when generation consent exists', async authorityState => {
  rpc.mockResolvedValue({data: {...allowed, authorityState, canReadDebrief: false, canGenerateDebrief: false}, error: null});
  await expect(requireDebriefAccess('read')).rejects.toThrow();
});
it.each(['userId', 'ageVersion', 'consentVersion', 'authorityVersion', 'mailboxVersion'] as const)(
  'rejects a changed %s after an await boundary', async key => {
    rpc.mockResolvedValue({data: {...allowed, [key]: key === 'userId' ? 'owner-b' : allowed[key] + 1}, error: null});
    await expect(requireDebriefAccess('generate', {...allowed})).rejects.toThrow();
  });
it('captures the expected owner and revisions before the status request yields', async () => {
  let release!: (value: unknown) => void;
  rpc.mockReturnValue(new Promise(resolve => {release = resolve;}));
  const expected = {...allowed};
  const pending = requireDebriefAccess('generate', expected);
  expected.userId = 'owner-b'; expected.consentVersion = 100;
  release({data: {...allowed, userId: 'owner-b', consentVersion: 100}, error: null});
  await expect(pending).rejects.toThrow();
});
it('preserves status read errors', async () => {
  const error = new Error('synthetic offline'); rpc.mockResolvedValue({data: null, error});
  await expect(fetchProcessingAccess()).rejects.toBe(error);
});
it('denies unsupported operation kinds before a request', async () => {
  await expect(requireDebriefAccess('unknown' as 'read')).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it('sends only the explicit purpose, versioned notice and captured account revisions', async () => {
  rpc.mockResolvedValue({data: {...allowed, aiConsent: false, canGenerateDebrief: false, consentVersion: 4}, error: null});
  const result = await setProcessingConsent('weekly-debrief', false, '2026-10-20-weekly-debrief-v1', allowed);
  expect(result.aiConsent).toBe(false);
  expect(rpc).toHaveBeenCalledWith('set_processing_consent', {
    p_purpose: 'weekly-debrief', p_granted: false, p_notice_version: '2026-10-20-weekly-debrief-v1',
    p_expected_user_id: 'owner-a', p_expected_age_version: 2, p_expected_consent_version: 3,
    p_expected_authority_version: 4, p_expected_mailbox_version: 5,
  });
});
it.each([
  ['authority', true, '2026-10-20-weekly-debrief-v1'],
  ['weekly-debrief', 'true', '2026-10-20-weekly-debrief-v1'],
  ['weekly-debrief', true, '2026-10-20-age-v1'],
  ['age-screening', true, '2026-10-20-weekly-debrief-v1'],
  ['age-screening', false, 'unknown'],
] as const)('does not send invalid consent purpose/grant/notice %#', async (purpose, granted, notice) => {
  await expect(setProcessingConsent(purpose as 'age-screening', granted as boolean, notice, allowed)).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it('requires a complete expected status before sending consent', async () => {
  await expect(setProcessingConsent('age-screening', true, '2026-10-20-age-v1', {} as ProcessingAccess)).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});
it.each([
  {userId: 'owner-b'}, {ageVersion: 3}, {authorityVersion: 5}, {mailboxVersion: 6},
  {consentVersion: 2}, {aiConsent: false, canGenerateDebrief: false},
])('rejects a stale or wrong-owner mutation result %#', async override => {
  rpc.mockResolvedValue({data: {...allowed, ...override}, error: null});
  await expect(setProcessingConsent('weekly-debrief', true, '2026-10-20-weekly-debrief-v1', allowed)).rejects.toThrow();
});
it('accepts an explicit age-purpose withdrawal without inventing AI eligibility', async () => {
  const withdrawn = {...allowed, ageConsent: false, canReadDebrief: false, canGenerateDebrief: false, consentVersion: 4};
  rpc.mockResolvedValue({data: withdrawn, error: null});
  expect(await setProcessingConsent('age-screening', false, '2026-10-20-age-v1', allowed)).toEqual(withdrawn);
});
it('notifies observers only for accepted mutations and isolates failing observers', async () => {
  const changed = jest.fn(); const stopBad = subscribeProcessingAccessChanges(() => {throw new Error('observer');});
  const stop = subscribeProcessingAccessChanges(changed);
  try {
    rpc.mockResolvedValueOnce({data: null, error: new Error('offline')});
    await expect(setProcessingConsent('weekly-debrief', true, '2026-10-20-weekly-debrief-v1', allowed)).rejects.toThrow();
    expect(changed).not.toHaveBeenCalled();
    await setProcessingConsent('weekly-debrief', true, '2026-10-20-weekly-debrief-v1', allowed);
    expect(changed).toHaveBeenCalledTimes(1);
    stop(); await setProcessingConsent('weekly-debrief', true, '2026-10-20-weekly-debrief-v1', allowed);
    expect(changed).toHaveBeenCalledTimes(1);
  } finally {stop(); stopBad();}
});
