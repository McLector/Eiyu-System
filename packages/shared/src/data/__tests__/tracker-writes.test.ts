const rpc = jest.fn();
const getSession = jest.fn();
const initializeAccountTimeZone = jest.fn();
jest.mock('../../supabase/client', () => ({
  supabase: {rpc: (...args: unknown[]) => rpc(...args), auth: {getSession: (...args: unknown[]) => getSession(...args)}},
}));
jest.mock('../profile', () => ({initializeAccountTimeZone: (...args: unknown[]) => initializeAccountTimeZone(...args)}));
import {
  NO_TARGETS, TRACKER_ERROR_CODES, invokeTrackerWrite, isRefusedBeforeSend, prepareDay, trackerErrorKind,
} from '../tracker-writes';
import {TRACKER_ACCESS_MESSAGE, type TrackerRevision, type TrackerTargetSnapshot} from '../tracker-access';
import {OWNER_A, OWNER_B, trackerRpcDouble} from '../../test-support/tracker-rpc';

const revision: TrackerRevision = {userId: OWNER_A, ageVersion: 1, consentVersion: 2, authorityVersion: 3};
const target: TrackerTargetSnapshot = {kind: 'habit', id: 'da230000-0000-4000-8000-0000000000aa', inputKind: 'basic'};

beforeEach(() => {
  rpc.mockReset().mockImplementation(() => trackerRpcDouble({data: null, error: null}));
  getSession.mockReset().mockResolvedValue({data: {session: {user: {id: OWNER_A}, access_token: 'token-a'}}, error: null});
  initializeAccountTimeZone.mockReset().mockResolvedValue('Asia/Manila');
});

describe('trackerErrorKind', () => {
  it.each([['ET001', 'under12-paused'], ['ET002', 'purpose-required'], ['ET003', 'access-changed'], ['22023', 'invalid-input'], ['42501', 'denied']])(
    'maps %s to %s', (code, kind) => {
      expect(trackerErrorKind({code, message: 'x'})).toBe(kind);
      expect(TRACKER_ERROR_CODES[code]).toBe(kind);
    });
  it.each([null, undefined, 'ET001', 7, {}, {code: 'PGRST301'}, {code: 'et001'}, {code: 42501}, {code: 'constructor'}, {code: '__proto__'}, {code: 'toString'}])(
    'returns null for anything else %#', error => {
      expect(trackerErrorKind(error)).toBeNull();
    });
});

describe('invokeTrackerWrite', () => {
  it('sends the operation, arguments with the target snapshots inside, and the four-field revision', async () => {
    rpc.mockImplementation(() => trackerRpcDouble({data: 'habit-id', error: null}));
    await expect(invokeTrackerWrite<string>('archive_habit', {p_habit_id: target.id}, revision, [target])).resolves.toBe('habit-id');
    expect(rpc).toHaveBeenCalledWith('apply_tracker_write', {
      p_operation: 'archive_habit',
      p_arguments: {p_habit_id: target.id, p_expected_targets: [target]},
      p_expected: {userId: OWNER_A, ageVersion: 1, consentVersion: 2, authorityVersion: 3},
    });
    expect(rpc.mock.results[0].value.headers).toEqual({Authorization: 'Bearer token-a'});
  });
  it('sends an empty target list for NO_TARGETS and never invents one', async () => {
    await invokeTrackerWrite('start_gym_session', {p_routine_id: target.id}, revision, NO_TARGETS);
    expect(rpc.mock.calls[0][1].p_arguments.p_expected_targets).toEqual([]);
    expect(NO_TARGETS).toEqual([]);
  });
  it('builds a fresh revision literal with exactly four keys, even from a wider object', async () => {
    const wide = {...revision, canWriteBasic: true, secret: 'x'} as TrackerRevision;
    await invokeTrackerWrite('archive_habit', {p_habit_id: target.id}, wide, [target]);
    const sent = rpc.mock.calls[0][1].p_expected;
    expect(Object.keys(sent).sort()).toEqual(['ageVersion', 'authorityVersion', 'consentVersion', 'userId']);
    expect(sent).not.toBe(wide);
  });
  it('copies the revision and targets before the first await, and never refreshes them', async () => {
    const live = {...revision}; const liveTarget = {...target}; const targets = [liveTarget];
    const pending = invokeTrackerWrite('archive_habit', {p_habit_id: target.id}, live, targets);
    live.consentVersion = 99; live.userId = OWNER_B; liveTarget.inputKind = 'custom'; targets.push({...target, id: 'other'});
    await pending;
    const call = rpc.mock.calls[0][1];
    expect(call.p_expected).toEqual(revision);
    expect(call.p_arguments.p_expected_targets).toEqual([target]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('keeps only kind, id and inputKind of each snapshot', async () => {
    await invokeTrackerWrite('archive_habit', {p_habit_id: target.id}, revision, [{...target, canWrite: true, name: 'private'} as TrackerTargetSnapshot]);
    expect(rpc.mock.calls[0][1].p_arguments.p_expected_targets).toEqual([target]);
  });
  it('refuses a caller who already put p_expected_targets in the arguments', async () => {
    await expect(invokeTrackerWrite('archive_habit', {p_habit_id: target.id, p_expected_targets: []}, revision, [target])).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null, undefined, 'x', [], {...revision, ageVersion: -1}, {...revision, userId: ''}])('refuses an invalid revision %#', async bad => {
    await expect(invokeTrackerWrite('archive_habit', {}, bad as TrackerRevision, [target])).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([null, 'x', [{kind: 'task', id: target.id, inputKind: 'basic'}], [{kind: 'habit', id: 7, inputKind: 'basic'}],
    [{kind: 'habit', id: target.id, inputKind: 'unknown'}], [null]])('refuses invalid targets %#', async bad => {
    await expect(invokeTrackerWrite('archive_habit', {}, revision, bad as TrackerTargetSnapshot[])).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('refuses an unknown operation and non-object arguments', async () => {
    await expect(invokeTrackerWrite('drop_everything' as 'archive_habit', {}, revision, NO_TARGETS)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    await expect(invokeTrackerWrite('archive_habit', null as unknown as Record<string, unknown>, revision, NO_TARGETS)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    await expect(invokeTrackerWrite('archive_habit', [] as unknown as Record<string, unknown>, revision, NO_TARGETS)).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('is bound to the revision owner: another session sends nothing', async () => {
    getSession.mockResolvedValue({data: {session: {user: {id: OWNER_B}, access_token: 'token-b'}}, error: null});
    await expect(invokeTrackerWrite('archive_habit', {}, revision, [target])).rejects.toThrow(TRACKER_ACCESS_MESSAGE);
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(['ET001', 'ET002', 'ET003', '22023', '42501'])('throws %s unchanged and never falls back to a direct write', async code => {
    const error = Object.assign(new Error('refused'), {code});
    rpc.mockImplementation(() => trackerRpcDouble({data: null, error}));
    await expect(invokeTrackerWrite('complete_habit', {p_habit_id: target.id}, revision, [target])).rejects.toBe(error);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe('apply_tracker_write');
  });
  it('does not echo the payload in a thrown error', async () => {
    rpc.mockImplementation(() => trackerRpcDouble({data: null, error: Object.assign(new Error('Invalid tracker input.'), {code: '22023'})}));
    const failure = await invokeTrackerWrite<null>('habit-save', {p_input: {name: 'synthetic-private-name'}}, revision, NO_TARGETS).catch((e: {message: string; code: string}) => e) as {message: string; code: string};
    expect(JSON.stringify([failure.message, failure.code])).not.toContain('synthetic-private-name');
  });
  it('returns an unknown result shape as is, without coercion', async () => {
    const odd = {unexpected: [1, 2]};
    rpc.mockImplementation(() => trackerRpcDouble({data: odd, error: null}));
    await expect(invokeTrackerWrite('archive_habit', {}, revision, [target])).resolves.toBe(odd);
  });
});

describe('prepareDay', () => {
  const ok = {basicPrepared: true, protectedPrepared: false, accessChanged: false};
  it('sets the account zone first, then invokes prepare-day with no arguments or targets', async () => {
    const order: string[] = [];
    initializeAccountTimeZone.mockImplementation(async () => { order.push('zone'); return 'Asia/Manila'; });
    rpc.mockImplementation(() => { order.push('rpc'); return trackerRpcDouble({data: ok, error: null}); });
    await expect(prepareDay(revision)).resolves.toEqual(ok);
    expect(order).toEqual(['zone', 'rpc']);
    expect(rpc).toHaveBeenCalledWith('apply_tracker_write', {
      p_operation: 'prepare-day', p_arguments: {p_expected_targets: []}, p_expected: {...revision},
    });
  });
  it('captures the revision before the zone call yields', async () => {
    const live = {...revision};
    rpc.mockImplementation(() => trackerRpcDouble({data: ok, error: null}));
    const pending = prepareDay(live);
    live.consentVersion = 50;
    await pending;
    expect(rpc.mock.calls[0][1].p_expected.consentVersion).toBe(2);
  });
  it('does not call the gateway when the zone cannot be set', async () => {
    initializeAccountTimeZone.mockRejectedValue(new Error('offline'));
    await expect(prepareDay(revision)).rejects.toThrow('offline');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('reports a changed access state', async () => {
    const changed = {basicPrepared: true, protectedPrepared: false, accessChanged: true};
    rpc.mockImplementation(() => trackerRpcDouble({data: changed, error: null}));
    await expect(prepareDay(revision)).resolves.toEqual(changed);
  });
  it.each([null, 'ok', [], {}, {basicPrepared: true, protectedPrepared: true}, {basicPrepared: 1, protectedPrepared: false, accessChanged: false},
    {basicPrepared: true, protectedPrepared: 'false', accessChanged: false}, {basicPrepared: true, protectedPrepared: false, accessChanged: null}])(
    'parses the result strictly %#', async data => {
      rpc.mockImplementation(() => trackerRpcDouble({data, error: null}));
      await expect(prepareDay(revision)).rejects.toThrow();
    });
  it('drops extra result fields', async () => {
    rpc.mockImplementation(() => trackerRpcDouble({data: {...ok, note: 'x'}, error: null}));
    await expect(prepareDay(revision)).resolves.toEqual(ok);
  });
  it('surfaces a gateway error unchanged', async () => {
    const error = Object.assign(new Error('paused'), {code: 'ET001'});
    rpc.mockImplementation(() => trackerRpcDouble({data: null, error}));
    await expect(prepareDay(revision)).rejects.toBe(error);
  });
});

describe('isRefusedBeforeSend', () => {
  it('marks local refusals, which never reached the server, apart from server and network failures', async () => {
    const local = await invokeTrackerWrite('archive_habit', {}, {...revision, ageVersion: -1}, [target]).catch((e: unknown) => e);
    expect(isRefusedBeforeSend(local)).toBe(true);
    getSession.mockResolvedValue({data: {session: {user: {id: OWNER_B}, access_token: 'b'}}, error: null});
    expect(isRefusedBeforeSend(await invokeTrackerWrite('archive_habit', {}, revision, [target]).catch((e: unknown) => e))).toBe(true);
    const server = Object.assign(new Error('refused'), {code: 'ET003'});
    getSession.mockResolvedValue({data: {session: {user: {id: OWNER_A}, access_token: 'a'}}, error: null});
    rpc.mockImplementation(() => trackerRpcDouble({data: null, error: server}));
    expect(isRefusedBeforeSend(await invokeTrackerWrite('archive_habit', {}, revision, [target]).catch((e: unknown) => e))).toBe(false);
    expect(isRefusedBeforeSend(new Error('network'))).toBe(false);
    expect(isRefusedBeforeSend(null)).toBe(false);
  });
});
