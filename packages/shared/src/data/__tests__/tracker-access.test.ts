const rpc = jest.fn();
const getSession = jest.fn();
jest.mock('../../supabase/client', () => ({
  supabase: {rpc: (...args: unknown[]) => rpc(...args), auth: {getSession: (...args: unknown[]) => getSession(...args)}},
}));
import {
  CUSTOM_TRACKER_NOTICE_VERSION, FITNESS_TRACKER_NOTICE_VERSION, TRACKER_ACCESS_MESSAGE, TRACKER_NOTICE_VERSIONS,
  copyTrackerRevision, fetchTrackerAccess, fetchTrackerTargets, parseTrackerAccess, setTrackerConsent,
  subscribeTrackerAccessChanges, toTargetSnapshot, type TrackerAccess, type TrackerRevision,
} from '../tracker-access';
import {OWNER_A, OWNER_B, trackerRpcDouble} from '../../test-support/tracker-rpc';

const revision: TrackerRevision = {userId: OWNER_A, ageVersion: 1, consentVersion: 2, authorityVersion: 3};
const allowed: TrackerAccess = {
  contractVersion: 1, revision, canWriteBasic: true, customConsent: true, fitnessConsent: false,
  customAuthorityState: 'not-required', fitnessAuthorityState: 'not-required', canWriteCustom: true, canWriteFitness: false,
};
const id = (n: number) => `da230000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeEach(() => {
  rpc.mockReset().mockImplementation(() => trackerRpcDouble({data: structuredClone(allowed), error: null}));
  getSession.mockReset().mockResolvedValue({data: {session: {user: {id: OWNER_A}, access_token: 'token-a'}}, error: null});
});

describe('parseTrackerAccess', () => {
  it('accepts the contract and returns an independent copy', () => {
    const parsed = parseTrackerAccess(allowed, OWNER_A);
    expect(parsed).toEqual(allowed);
    expect(parsed.revision).not.toBe(allowed.revision);
  });
  it('does not turn the old processing contract into tracker permission', () => {
    expect(() => parseTrackerAccess({contractVersion: 1, canGenerateDebrief: true}, OWNER_A)).toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it.each([null, undefined, [], 'allowed', 7, true, {}])('rejects a non-object or empty value %#', value => {
    expect(() => parseTrackerAccess(value, OWNER_A)).toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it('rejects a response for a different owner', () => {
    expect(() => parseTrackerAccess(allowed, OWNER_B)).toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it.each(['', '  ', undefined as unknown as string])('rejects an empty expected owner %#', owner => {
    expect(() => parseTrackerAccess({...allowed, revision: {...revision, userId: owner ?? ''}}, owner)).toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it.each(Object.keys(allowed))('rejects a missing %s', key => {
    const value: Record<string, unknown> = structuredClone(allowed) as unknown as Record<string, unknown>;
    delete value[key];
    expect(() => parseTrackerAccess(value, OWNER_A)).toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it.each(['ageVersion', 'consentVersion', 'authorityVersion'] as const)('rejects an invalid %s', key => {
    for (const bad of [-1, 1.5, '1', null, NaN, Infinity, 2147483648, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => parseTrackerAccess({...allowed, revision: {...revision, [key]: bad}}, OWNER_A)).toThrow(TRACKER_ACCESS_MESSAGE);
    }
  });
  it('rejects a missing revision field', () => {
    const {userId, ...partial} = revision;
    void userId;
    expect(() => parseTrackerAccess({...allowed, revision: partial}, OWNER_A)).toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it.each(['canWriteBasic', 'customConsent', 'fitnessConsent', 'canWriteCustom', 'canWriteFitness'] as const)(
    'does not coerce the %s decision', key => {
      for (const bad of [0, 1, 'true', null, undefined]) {
        expect(() => parseTrackerAccess({...allowed, [key]: bad}, OWNER_A)).toThrow(TRACKER_ACCESS_MESSAGE);
      }
    });
  it.each([
    {contractVersion: 2}, {contractVersion: '1'}, {contractVersion: undefined},
    {customAuthorityState: 'self-approved'}, {customAuthorityState: null}, {fitnessAuthorityState: 'APPROVED'},
  ])('rejects an unsupported version or authority state %#', override => {
    expect(() => parseTrackerAccess({...allowed, ...override}, OWNER_A)).toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it.each([
    {canWriteBasic: false},
    {customConsent: false},
    {customAuthorityState: 'pending'}, {customAuthorityState: 'revoked'},
    {canWriteFitness: true},
    {fitnessConsent: true, fitnessAuthorityState: 'pending', canWriteFitness: true},
  ])('rejects a grant that contradicts its own conditions %#', override => {
    expect(() => parseTrackerAccess({...allowed, ...override}, OWNER_A)).toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it('keeps the two purposes independent', () => {
    const fitnessOnly = {...allowed, customConsent: false, canWriteCustom: false, fitnessConsent: true, canWriteFitness: true};
    expect(parseTrackerAccess(fitnessOnly, OWNER_A)).toEqual(fitnessOnly);
    const neither = {...allowed, customConsent: false, canWriteCustom: false};
    expect(parseTrackerAccess(neither, OWNER_A).canWriteFitness).toBe(false);
  });
  it('accepts denied state for a paused account and does not invent a grant', () => {
    const paused = {...allowed, canWriteBasic: false, canWriteCustom: false, canWriteFitness: false};
    expect(parseTrackerAccess(paused, OWNER_A)).toEqual(paused);
  });
  it('drops fields it does not know instead of retaining them', () => {
    const parsed = parseTrackerAccess({...allowed, secret: 'synthetic-do-not-retain', revision: {...revision, extra: 1}}, OWNER_A);
    expect(parsed).toEqual(allowed);
    expect(JSON.stringify(parsed)).not.toContain('synthetic');
  });
});

describe('fetchTrackerAccess', () => {
  it('reads the caller state pinned to the expected owner', async () => {
    expect(await fetchTrackerAccess(OWNER_A)).toEqual(allowed);
    expect(rpc).toHaveBeenCalledWith('get_tracker_processing_access');
    expect(rpc.mock.results[0].value.headers).toEqual({Authorization: 'Bearer token-a'});
  });
  it('refuses when the session belongs to another account, before any request', async () => {
    getSession.mockResolvedValue({data: {session: {user: {id: OWNER_B}, access_token: 'token-b'}}, error: null});
    await expect(fetchTrackerAccess(OWNER_A)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('refuses when there is no session', async () => {
    getSession.mockResolvedValue({data: {session: null}, error: null});
    await expect(fetchTrackerAccess(OWNER_A)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it('rejects a response for another owner', async () => {
    rpc.mockImplementation(() => trackerRpcDouble({data: {...allowed, revision: {...revision, userId: OWNER_B}}, error: null}));
    await expect(fetchTrackerAccess(OWNER_A)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it('rejects the old processing shape', async () => {
    rpc.mockImplementation(() => trackerRpcDouble({data: {contractVersion: 1, userId: OWNER_A, canGenerateDebrief: true}, error: null}));
    await expect(fetchTrackerAccess(OWNER_A)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it('surfaces a server error unchanged', async () => {
    const error = Object.assign(new Error('boom'), {code: '42501'});
    rpc.mockImplementation(() => trackerRpcDouble({data: null, error}));
    await expect(fetchTrackerAccess(OWNER_A)).rejects.toBe(error);
  });
});

describe('fetchTrackerTargets', () => {
  const targetRows = (kind: 'habit' | 'chain', ids: string[], overrides: Record<string, unknown> = {}) =>
    ids.map(i => ({kind, id: i, inputKind: 'basic', canWrite: true, ...overrides}));
  beforeEach(() => {
    rpc.mockImplementation((_name: string, args: {p_kind: 'habit' | 'chain'; p_ids: string[]}) =>
      trackerRpcDouble({data: targetRows(args.p_kind, args.p_ids), error: null}));
  });

  it('classifies targets in the requested order', async () => {
    const result = await fetchTrackerTargets('habit', [id(2), id(1)], OWNER_A);
    expect(result.map(t => t.id)).toEqual([id(2), id(1)]);
    expect(result[0]).toEqual({kind: 'habit', id: id(2), inputKind: 'basic', canWrite: true});
    expect(rpc).toHaveBeenCalledWith('get_tracker_targets', {p_kind: 'habit', p_ids: [id(2), id(1)]});
    expect(rpc.mock.results[0].value.headers).toEqual({Authorization: 'Bearer token-a'});
  });
  it('reads in chunks of 100 and keeps the order across chunks', async () => {
    const ids = Array.from({length: 250}, (_, n) => id(n + 1));
    const result = await fetchTrackerTargets('chain', ids, OWNER_A);
    expect(rpc.mock.calls.map(call => call[1].p_ids.length)).toEqual([100, 100, 50]);
    expect(result.map(t => t.id)).toEqual(ids);
  });
  it('makes no request for no ids', async () => {
    expect(await fetchTrackerTargets('habit', [], OWNER_A)).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('asks once for a repeated id', async () => {
    const result = await fetchTrackerTargets('habit', [id(1), id(1), id(2)], OWNER_A);
    expect(rpc.mock.calls[0][1].p_ids).toEqual([id(1), id(2)]);
    expect(result.map(t => t.id)).toEqual([id(1), id(2)]);
  });
  it.each(['task', '', null])('refuses an unknown kind %#', async kind => {
    await expect(fetchTrackerTargets(kind as 'habit', [id(1)], OWNER_A)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['', 7, null, undefined])('refuses an invalid id %#', async bad => {
    await expect(fetchTrackerTargets('habit', [id(1), bad as string], OWNER_A)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('refuses a missing id instead of calling it basic', async () => {
    rpc.mockImplementation((_n: string, args: {p_ids: string[]}) =>
      trackerRpcDouble({data: targetRows('habit', args.p_ids.slice(1)), error: null}));
    await expect(fetchTrackerTargets('habit', [id(1), id(2)], OWNER_A)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it('refuses an extra or foreign id', async () => {
    rpc.mockImplementation((_n: string, args: {p_ids: string[]}) =>
      trackerRpcDouble({data: targetRows('habit', [...args.p_ids, id(99)]), error: null}));
    await expect(fetchTrackerTargets('habit', [id(1)], OWNER_A)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    rpc.mockImplementation(() => trackerRpcDouble({data: targetRows('habit', [id(99)]), error: null}));
    await expect(fetchTrackerTargets('habit', [id(1)], OWNER_A)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it('refuses a duplicated row', async () => {
    rpc.mockImplementation(() => trackerRpcDouble({data: targetRows('habit', [id(1), id(1)]), error: null}));
    await expect(fetchTrackerTargets('habit', [id(1), id(2)], OWNER_A)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it.each([{inputKind: undefined}, {inputKind: null}, {inputKind: 'Basic'}, {inputKind: 'unknown'}])(
    'refuses a missing or unknown classification %#', async override => {
      rpc.mockImplementation((_n: string, args: {p_ids: string[]}) =>
        trackerRpcDouble({data: targetRows('habit', args.p_ids, override), error: null}));
      await expect(fetchTrackerTargets('habit', [id(1)], OWNER_A)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    });
  it.each([{canWrite: undefined}, {canWrite: 'true'}, {canWrite: 1}, {kind: 'chain'}])('refuses a malformed row %#', async override => {
    rpc.mockImplementation((_n: string, args: {p_ids: string[]}) =>
      trackerRpcDouble({data: targetRows('habit', args.p_ids, override), error: null}));
    await expect(fetchTrackerTargets('habit', [id(1)], OWNER_A)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it.each([null, {}, 'rows'])('refuses a non-array response %#', async data => {
    rpc.mockImplementation(() => trackerRpcDouble({data, error: null}));
    await expect(fetchTrackerTargets('habit', [id(1)], OWNER_A)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
  });
  it('refuses a session of another owner before any request', async () => {
    getSession.mockResolvedValue({data: {session: {user: {id: OWNER_B}, access_token: 'token-b'}}, error: null});
    await expect(fetchTrackerTargets('habit', [id(1)], OWNER_A)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('surfaces a server error unchanged', async () => {
    const error = Object.assign(new Error('Tracker target unavailable.'), {code: '42501'});
    rpc.mockImplementation(() => trackerRpcDouble({data: null, error}));
    await expect(fetchTrackerTargets('habit', [id(1)], OWNER_A)).rejects.toBe(error);
  });
});

describe('setTrackerConsent', () => {
  const grantedFitness = {...allowed, revision: {...revision, consentVersion: 3}, fitnessConsent: true, canWriteFitness: true};
  it('sends exactly the four-field revision and the current notice, pinned to the owner', async () => {
    rpc.mockImplementation(() => trackerRpcDouble({data: grantedFitness, error: null}));
    const result = await setTrackerConsent('fitness-tracking', true, FITNESS_TRACKER_NOTICE_VERSION, revision);
    expect(result.fitnessConsent).toBe(true);
    expect(rpc).toHaveBeenCalledWith('set_tracker_processing_consent', {
      p_purpose: 'fitness-tracking', p_granted: true, p_notice_version: FITNESS_TRACKER_NOTICE_VERSION,
      p_expected: {userId: OWNER_A, ageVersion: 1, consentVersion: 2, authorityVersion: 3},
    });
    expect(rpc.mock.results[0].value.headers).toEqual({Authorization: 'Bearer token-a'});
  });
  it('sends a copy taken before the first await', async () => {
    const live = {...revision};
    rpc.mockImplementation(() => trackerRpcDouble({data: grantedFitness, error: null}));
    const pending = setTrackerConsent('fitness-tracking', true, FITNESS_TRACKER_NOTICE_VERSION, live);
    live.userId = OWNER_B; live.consentVersion = 99;
    await pending;
    expect(rpc.mock.calls[0][1].p_expected).toEqual(revision);
  });
  it('refuses an old, foreign or purpose-mismatched notice without a request', async () => {
    await expect(setTrackerConsent('fitness-tracking', true, '2026-10-20-weekly-debrief-v1', revision)).rejects.toThrow('Review the current notice');
    await expect(setTrackerConsent('fitness-tracking', true, CUSTOM_TRACKER_NOTICE_VERSION, revision)).rejects.toThrow('Review the current notice');
    await expect(setTrackerConsent('custom-tracker', true, FITNESS_TRACKER_NOTICE_VERSION, revision)).rejects.toThrow('Review the current notice');
    await expect(setTrackerConsent('ai' as 'custom-tracker', true, CUSTOM_TRACKER_NOTICE_VERSION, revision)).rejects.toThrow('Review the current notice');
    await expect(setTrackerConsent('custom-tracker', 'yes' as unknown as boolean, CUSTOM_TRACKER_NOTICE_VERSION, revision)).rejects.toThrow('Review the current notice');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('refuses an invalid expected revision without a request', async () => {
    await expect(setTrackerConsent('custom-tracker', true, CUSTOM_TRACKER_NOTICE_VERSION, {...revision, consentVersion: -1})).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    await expect(setTrackerConsent('custom-tracker', true, CUSTOM_TRACKER_NOTICE_VERSION, {...revision, extra: 1} as TrackerRevision)).resolves.toBeDefined();
  });
  it('refuses a session of another owner', async () => {
    getSession.mockResolvedValue({data: {session: {user: {id: OWNER_B}, access_token: 'token-b'}}, error: null});
    await expect(setTrackerConsent('custom-tracker', true, CUSTOM_TRACKER_NOTICE_VERSION, revision)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects a result for another owner, a moved age or authority revision, or a decision that did not land', async () => {
    const bad = [
      {...grantedFitness, revision: {...grantedFitness.revision, userId: OWNER_B}},
      {...grantedFitness, revision: {...grantedFitness.revision, ageVersion: 9}},
      {...grantedFitness, revision: {...grantedFitness.revision, authorityVersion: 9}},
      {...grantedFitness, revision: {...grantedFitness.revision, consentVersion: 1}},
      {...allowed, fitnessConsent: false, canWriteFitness: false},
    ];
    for (const data of bad) {
      rpc.mockImplementation(() => trackerRpcDouble({data, error: null}));
      await expect(setTrackerConsent('fitness-tracking', true, FITNESS_TRACKER_NOTICE_VERSION, revision)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    }
  });
  it('notifies subscribers only after an accepted change, and tolerates a failing observer', async () => {
    const seen = jest.fn(); const failing = jest.fn(() => { throw new Error('observer'); });
    const stop = subscribeTrackerAccessChanges(seen); const stopFailing = subscribeTrackerAccessChanges(failing);
    rpc.mockImplementation(() => trackerRpcDouble({data: null, error: Object.assign(new Error('stale'), {code: 'ET003'})}));
    await expect(setTrackerConsent('fitness-tracking', true, FITNESS_TRACKER_NOTICE_VERSION, revision)).rejects.toMatchObject({code: 'ET003'});
    expect(seen).not.toHaveBeenCalled();
    rpc.mockImplementation(() => trackerRpcDouble({data: grantedFitness, error: null}));
    await setTrackerConsent('fitness-tracking', true, FITNESS_TRACKER_NOTICE_VERSION, revision);
    expect(seen).toHaveBeenCalledTimes(1); expect(failing).toHaveBeenCalledTimes(1);
    stop(); stopFailing();
    await setTrackerConsent('fitness-tracking', true, FITNESS_TRACKER_NOTICE_VERSION, revision);
    expect(seen).toHaveBeenCalledTimes(1);
  });
  it('can withdraw a purpose', async () => {
    const withdrawn = {...allowed, revision: {...revision, consentVersion: 3}, customConsent: false, canWriteCustom: false};
    rpc.mockImplementation(() => trackerRpcDouble({data: withdrawn, error: null}));
    const result = await setTrackerConsent('custom-tracker', false, CUSTOM_TRACKER_NOTICE_VERSION, revision);
    expect(result.customConsent).toBe(false);
  });
});

describe('revision and snapshot helpers', () => {
  it('versions the two notices independently of the AI notice', () => {
    expect(TRACKER_NOTICE_VERSIONS).toEqual({'custom-tracker': CUSTOM_TRACKER_NOTICE_VERSION, 'fitness-tracking': FITNESS_TRACKER_NOTICE_VERSION});
    expect(CUSTOM_TRACKER_NOTICE_VERSION).not.toBe(FITNESS_TRACKER_NOTICE_VERSION);
  });
  it('copyTrackerRevision returns a detached four-field object', () => {
    const copy = copyTrackerRevision({...revision, extra: 'x'} as TrackerRevision);
    expect(copy).toEqual(revision);
    expect(Object.keys(copy).sort()).toEqual(['ageVersion', 'authorityVersion', 'consentVersion', 'userId']);
    expect(copy).not.toBe(revision);
  });
  it.each([null, undefined, {}, {...revision, ageVersion: -1}, {...revision, userId: ''}, {...revision, consentVersion: 1.5}])(
    'copyTrackerRevision refuses an invalid revision %#', bad => {
      expect(() => copyTrackerRevision(bad as TrackerRevision)).toThrow(TRACKER_ACCESS_MESSAGE);
    });
  it('toTargetSnapshot keeps kind, id and input kind only', () => {
    expect(toTargetSnapshot({kind: 'habit', id: id(1), inputKind: 'custom', canWrite: false})).toEqual({kind: 'habit', id: id(1), inputKind: 'custom'});
  });
});
