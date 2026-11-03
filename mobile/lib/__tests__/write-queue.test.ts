import type { Quest } from '@eiyu/shared';
import {
  applyOverlay,
  describeEntry,
  classifyError,
  decodeQueue,
  encodeQueue,
  expireEntries,
  expireHeldEntries,
  HELD_RETENTION_MS,
  enqueue,
  FAILURE_MESSAGES,
  isExpired,
  reviveEntries,
  resolveUncertain,
  syncStateByHabit,
  waitingCount,
  type QueueEntry,
} from '../write-queue';

const USER = 'user-1';
const TODAY = '2026-10-05';

function input(overrides: Partial<Parameters<typeof enqueue>[1]> = {}): Parameters<typeof enqueue>[1] {
  return { id: `id-${Math.random()}`, userId: USER, kind: 'complete', habitId: 'h1', accountDate: TODAY, now: 1000, ...overrides };
}

function entry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'e1', userId: USER, kind: 'complete', habitId: 'h1', accountDate: TODAY,
    createdAt: 1000, attempts: 0, status: 'pending', ...overrides,
  };
}

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'h1', name: 'Run', stat: 'vitality', difficulty: 'easy', easyVersion: null, description: null,
    questType: 'habit', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0, frozen: false,
    completed: false, targetCount: null, progressCount: 0, ...overrides,
  } as Quest;
}

describe('enqueue', () => {
  it('appends a first entry as pending with zero attempts', () => {
    const result = enqueue([], input({ id: 'a' }));
    expect(result).toEqual([expect.objectContaining({ id: 'a', kind: 'complete', status: 'pending', attempts: 0, createdAt: 1000 })]);
  });

  it('keeps the quest name given at tap time so a failure can still name a quest that left the board', () => {
    const result = enqueue([], input({ id: 'a', label: 'Morning run' }));
    expect(result[0].label).toBe('Morning run');
    expect(enqueue([], input({ id: 'b' }))[0]).not.toHaveProperty('label');
  });

  it('cancels a pending complete followed by an undo for the same habit and day', () => {
    const first = enqueue([], input({ id: 'a', kind: 'complete' }));
    expect(enqueue(first, input({ id: 'b', kind: 'undo' }))).toEqual([]);
  });

  it('cancels a pending undo followed by a complete', () => {
    const first = enqueue([], input({ id: 'a', kind: 'undo' }));
    expect(enqueue(first, input({ id: 'b', kind: 'complete' }))).toEqual([]);
  });

  it('does not cancel across different habits or different days', () => {
    const first = enqueue([], input({ id: 'a', kind: 'complete', habitId: 'h1' }));
    expect(enqueue(first, input({ id: 'b', kind: 'undo', habitId: 'h2' }))).toHaveLength(2);
    expect(enqueue(first, input({ id: 'c', kind: 'undo', accountDate: '2026-10-04' }))).toHaveLength(2);
  });

  it('does not cancel against an entry that is already sending, uncertain or failed', () => {
    for (const status of ['sending', 'uncertain', 'failed'] as const) {
      const existing = [entry({ id: 'a', kind: 'complete', status })];
      expect(enqueue(existing, input({ id: 'b', kind: 'undo' }))).toHaveLength(2);
    }
  });

  it('merges consecutive progress deltas into one net delta', () => {
    let list = enqueue([], input({ id: 'a', kind: 'progress', delta: 1, base: 2 }));
    list = enqueue(list, input({ id: 'b', kind: 'progress', delta: 1, base: 2 }));
    list = enqueue(list, input({ id: 'c', kind: 'progress', delta: -1, base: 2 }));
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(expect.objectContaining({ id: 'a', kind: 'progress', delta: 1, base: 2 }));
  });

  it('drops the progress entry when the net delta is zero', () => {
    let list = enqueue([], input({ id: 'a', kind: 'progress', delta: 1, base: 0 }));
    list = enqueue(list, input({ id: 'b', kind: 'progress', delta: -1, base: 0 }));
    expect(list).toEqual([]);
  });

  it('never merges progress across a complete or undo of the same habit', () => {
    let list = enqueue([], input({ id: 'a', kind: 'progress', delta: 1, base: 0 }));
    list = enqueue(list, input({ id: 'b', kind: 'complete' }));
    list = enqueue(list, input({ id: 'c', kind: 'progress', delta: 1, base: 0 }));
    expect(list.map(e => e.kind)).toEqual(['progress', 'complete', 'progress']);
  });

  it('keeps a recovery entry once even when enqueued twice', () => {
    let list = enqueue([], input({ id: 'a', kind: 'recovery', accountDate: TODAY }));
    list = enqueue(list, input({ id: 'b', kind: 'recovery', accountDate: TODAY }));
    expect(list).toHaveLength(1);
  });

  it('does not mutate the list it was given', () => {
    const original = [entry({ id: 'a' })];
    const copy = JSON.stringify(original);
    enqueue(original, input({ id: 'b', kind: 'undo' }));
    expect(JSON.stringify(original)).toBe(copy);
  });

  it('rejects a progress entry without a numeric delta', () => {
    expect(() => enqueue([], input({ kind: 'progress' }))).toThrow(/delta/i);
  });
});

describe('isExpired', () => {
  const instant = new Date('2026-10-06T01:00:00Z');

  it('is false while the account date is still the entry date', () => {
    expect(isExpired(entry({ accountDate: '2026-10-05' }), instant, 'America/Los_Angeles')).toBe(false);
  });

  it('is true once the account date has moved on, using the account zone and not the device zone', () => {
    expect(isExpired(entry({ accountDate: '2026-10-05' }), instant, 'Asia/Tokyo')).toBe(true);
  });

  it('is true for an entry dated in the future of an account zone that moved back', () => {
    expect(isExpired(entry({ accountDate: '2026-10-07' }), instant, 'Asia/Tokyo')).toBe(true);
  });

  it('never expires a recovery entry (the server owns its date)', () => {
    expect(isExpired(entry({ kind: 'recovery', accountDate: '2026-10-01' }), instant, 'Asia/Tokyo')).toBe(false);
  });
});

describe('classifyError', () => {
  it('treats a network failure as retryable offline', () => {
    expect(classifyError('complete', new Error('Network request failed'))).toEqual({ type: 'network' });
    expect(classifyError('progress', new TypeError('Failed to fetch'))).toEqual({ type: 'network' });
  });

  it('treats a unique violation on complete as already applied', () => {
    expect(classifyError('complete', { code: '23505', message: 'duplicate key value' })).toEqual({ type: 'applied' });
  });

  it('does not treat a unique violation as applied for other kinds', () => {
    expect(classifyError('undo', { code: '23505', message: 'duplicate key' }).type).not.toBe('applied');
  });

  it('maps the current-account-date refusal to day-passed', () => {
    const result = classifyError('complete', { message: 'normal completion date must be the current account date' });
    expect(result).toEqual(expect.objectContaining({ type: 'failed', reason: 'day-passed' }));
  });

  it('maps expired and missing recovery windows to recovery-closed', () => {
    expect(classifyError('recovery', new Error('Recovery window has expired'))).toEqual(expect.objectContaining({ type: 'failed', reason: 'recovery-closed' }));
    expect(classifyError('recovery', new Error('No recovery window is available'))).toEqual(expect.objectContaining({ type: 'failed', reason: 'recovery-closed' }));
  });

  it('maps not eligible, not found and not a quantity habit to not-on-board', () => {
    for (const message of ['habit x is not eligible on 2026-10-05', 'habit x not found for calling user', 'habit x is not a quantity habit']) {
      expect(classifyError('complete', { message })).toEqual(expect.objectContaining({ type: 'failed', reason: 'not-on-board' }));
    }
  });

  it('maps authentication problems to auth', () => {
    expect(classifyError('complete', { message: 'authentication required' })).toEqual({ type: 'auth' });
    expect(classifyError('complete', { message: 'JWT expired', code: 'PGRST301' })).toEqual({ type: 'auth' });
  });

  it('treats anything unknown as a retryable server error carrying the message', () => {
    expect(classifyError('complete', { message: 'upstream exploded' })).toEqual({ type: 'retry', message: 'upstream exploded' });
    expect(classifyError('complete', null)).toEqual(expect.objectContaining({ type: 'retry' }));
  });

  it('gives every failed outcome a human message', () => {
    const result = classifyError('complete', { message: 'normal completion date must be the current account date' });
    expect(result.type === 'failed' && result.message.length > 10).toBe(true);
  });
});

describe('resolveUncertain', () => {
  it('drops a complete that the server already shows as done, and sends it otherwise', () => {
    expect(resolveUncertain(entry({ kind: 'complete' }), quest({ completed: true }))).toEqual({ action: 'drop' });
    expect(resolveUncertain(entry({ kind: 'complete' }), quest({ completed: false }))).toEqual({ action: 'send' });
  });

  it('drops an undo that the server already shows as not done, and sends it otherwise', () => {
    expect(resolveUncertain(entry({ kind: 'undo' }), quest({ completed: false }))).toEqual({ action: 'drop' });
    expect(resolveUncertain(entry({ kind: 'undo' }), quest({ completed: true }))).toEqual({ action: 'send' });
  });

  it('always sends a recovery (the server replay is already safe)', () => {
    expect(resolveUncertain(entry({ kind: 'recovery' }), quest({ frozen: true }))).toEqual({ action: 'send' });
  });

  it('fails complete, undo and progress when the quest is no longer on the board', () => {
    for (const kind of ['complete', 'undo', 'progress'] as const) {
      expect(resolveUncertain(entry({ kind, delta: 1, base: 0 }), undefined)).toEqual({ action: 'fail', reason: 'not-on-board' });
    }
  });

  it('still sends a recovery when the re-read no longer lists the quest, because the recovery may have landed and its replay is safe', () => {
    expect(resolveUncertain(entry({ kind: 'recovery' }), undefined)).toEqual({ action: 'send' });
  });

  describe('progress', () => {
    const e = entry({ kind: 'progress', delta: 2, base: 1 });
    it('drops when the server already holds base + delta', () => {
      expect(resolveUncertain(e, quest({ targetCount: 5, progressCount: 3 }))).toEqual({ action: 'drop' });
    });
    it('sends when the server still holds the base', () => {
      expect(resolveUncertain(e, quest({ targetCount: 5, progressCount: 1 }))).toEqual({ action: 'send' });
    });
    it('fails rather than guess when the server holds anything else', () => {
      expect(resolveUncertain(e, quest({ targetCount: 5, progressCount: 4 }))).toEqual({ action: 'fail', reason: 'progress-changed' });
    });
    it('clamps the expected count to the target', () => {
      expect(resolveUncertain(entry({ kind: 'progress', delta: 9, base: 3 }), quest({ targetCount: 5, progressCount: 5 }))).toEqual({ action: 'drop' });
    });
    it('clamps the expected count at zero', () => {
      expect(resolveUncertain(entry({ kind: 'progress', delta: -9, base: 2 }), quest({ targetCount: 5, progressCount: 0 }))).toEqual({ action: 'drop' });
    });
    it('fails when the habit is no longer a quantity habit', () => {
      expect(resolveUncertain(e, quest({ targetCount: null }))).toEqual({ action: 'fail', reason: 'not-on-board' });
    });
  });
});

describe('applyOverlay', () => {
  it('marks a pending complete as completed and a pending undo as not completed', () => {
    const quests = [quest({ id: 'h1', completed: false }), quest({ id: 'h2', completed: true })];
    const entries = [entry({ habitId: 'h1', kind: 'complete' }), entry({ id: 'e2', habitId: 'h2', kind: 'undo' })];
    const result = applyOverlay(quests, entries, TODAY);
    expect(result.map(q => q.completed)).toEqual([true, false]);
  });

  it('applies progress deltas, clamped to the target, and derives completed', () => {
    const quests = [quest({ targetCount: 3, progressCount: 2 })];
    const result = applyOverlay(quests, [entry({ kind: 'progress', delta: 5, base: 2 })], TODAY);
    expect(result[0]).toEqual(expect.objectContaining({ progressCount: 3, completed: true }));
  });

  it('applies several progress entries for one habit in order', () => {
    const quests = [quest({ targetCount: 5, progressCount: 0 })];
    const entries = [
      entry({ id: 'a', kind: 'progress', delta: 2, base: 0 }),
      entry({ id: 'b', kind: 'progress', delta: -1, base: 0, createdAt: 2000 }),
    ];
    expect(applyOverlay(quests, entries, TODAY)[0].progressCount).toBe(1);
  });

  it('ignores failed entries and entries for another day', () => {
    const quests = [quest({ completed: false })];
    expect(applyOverlay(quests, [entry({ status: 'failed' })], TODAY)[0].completed).toBe(false);
    expect(applyOverlay(quests, [entry({ accountDate: '2026-10-04' })], TODAY)[0].completed).toBe(false);
  });

  it('applies sending and uncertain entries (the user still sees their intent)', () => {
    const quests = [quest({ completed: false })];
    expect(applyOverlay(quests, [entry({ status: 'sending' })], TODAY)[0].completed).toBe(true);
    expect(applyOverlay(quests, [entry({ status: 'uncertain' })], TODAY)[0].completed).toBe(true);
  });

  it('thaws a frozen quest for a pending recovery', () => {
    const quests = [quest({ frozen: true })];
    expect(applyOverlay(quests, [entry({ kind: 'recovery', accountDate: '2026-10-01' })], TODAY)[0].frozen).toBe(false);
  });

  it('returns the same array and objects when nothing applies', () => {
    const quests = [quest()];
    expect(applyOverlay(quests, [], TODAY)).toBe(quests);
  });

  it('does not mutate the input quests', () => {
    const quests = [quest({ completed: false })];
    applyOverlay(quests, [entry()], TODAY);
    expect(quests[0].completed).toBe(false);
  });
});

describe('syncStateByHabit', () => {
  it('reports pending, checking and failed per habit, with failed winning over the rest', () => {
    const map = syncStateByHabit([
      entry({ id: 'a', habitId: 'h1', status: 'pending', attempts: 1 }),
      entry({ id: 'b', habitId: 'h2', status: 'uncertain' }),
      entry({ id: 'd', habitId: 'h4', status: 'failed' }),
      entry({ id: 'e', habitId: 'h4', status: 'pending', attempts: 1 }),
    ], false);
    expect(map.get('h1')).toBe('pending');
    expect(map.get('h2')).toBe('checking');
    expect(map.get('h4')).toBe('failed');
    expect(map.get('h5')).toBeUndefined();
  });

  it('stays quiet about a write that is simply being sent while online', () => {
    const map = syncStateByHabit([
      entry({ id: 'a', habitId: 'h1', status: 'sending', attempts: 1 }),
      entry({ id: 'b', habitId: 'h2', status: 'pending', attempts: 0 }),
    ], false);
    expect(map.size).toBe(0);
  });

  it('tags every live write as waiting while the device is offline', () => {
    const map = syncStateByHabit([
      entry({ id: 'a', habitId: 'h1', status: 'pending', attempts: 0 }),
      entry({ id: 'b', habitId: 'h2', status: 'pending', attempts: 0 }),
    ], true);
    expect([...map.values()]).toEqual(['pending', 'pending']);
  });
});

describe('waitingCount', () => {
  it('counts the habits that show a waiting or checking tag, not failed ones or quiet in-flight writes', () => {
    const entries = [
      entry({ id: 'a', habitId: 'h1', status: 'pending', attempts: 1 }),
      entry({ id: 'b', habitId: 'h2', status: 'uncertain' }),
      entry({ id: 'c', habitId: 'h3', status: 'failed' }),
      entry({ id: 'd', habitId: 'h4', status: 'sending', attempts: 1 }),
    ];
    expect(waitingCount(entries, false)).toBe(2);
    expect(waitingCount([], true)).toBe(0);
  });

  it('counts entries, so two writes to one habit are two changes', () => {
    const entries = [entry({ id: 'a', status: 'pending' }), entry({ id: 'b', kind: 'progress', delta: 1, base: 0, status: 'pending' })];
    expect(waitingCount(entries, true)).toBe(2);
  });
});

describe('encodeQueue / decodeQueue', () => {
  it('round-trips entries for the same user', () => {
    const entries = [entry({ id: 'a', label: 'Run' }), entry({ id: 'b', kind: 'progress', delta: 2, base: 1 })];
    expect(decodeQueue(encodeQueue(entries), USER)).toEqual(entries);
  });

  it('returns an empty list for null, empty, corrupt or non-object input', () => {
    for (const raw of [null, undefined, '', '{not json', '42', '"x"', 'null']) {
      expect(decodeQueue(raw as string | null, USER)).toEqual([]);
    }
  });

  it('returns an empty list for a wrong version', () => {
    expect(decodeQueue(JSON.stringify({ v: 2, entries: [entry()] }), USER)).toEqual([]);
  });

  it('drops entries that belong to another user', () => {
    const raw = encodeQueue([entry({ id: 'a' }), entry({ id: 'b', userId: 'someone-else' })]);
    expect(decodeQueue(raw, USER).map(e => e.id)).toEqual(['a']);
  });

  it('drops malformed entries and keeps the valid ones', () => {
    const raw = JSON.stringify({ v: 1, entries: [entry({ id: 'ok' }), { id: 'bad' }, { ...entry({ id: 'worse' }), kind: 'delete' }, null] });
    expect(decodeQueue(raw, USER).map(e => e.id)).toEqual(['ok']);
  });
});

describe('reviveEntries', () => {
  const now = new Date('2026-10-05T12:00:00Z');

  it('turns a sending entry into uncertain', () => {
    expect(reviveEntries([entry({ status: 'sending' })], now, 'UTC')[0].status).toBe('uncertain');
  });

  it('fails entries from an earlier account day with a day-passed reason', () => {
    const [revived] = reviveEntries([entry({ accountDate: '2026-10-04' })], now, 'UTC');
    expect(revived.status).toBe('failed');
    expect(revived.failure).toEqual(expect.objectContaining({ reason: 'day-passed' }));
  });

  it('does not expire anything while the account zone is unknown, but still marks a mid-send entry uncertain', () => {
    const old = entry({ id: 'old', accountDate: '2026-10-01' });
    const mid = entry({ id: 'mid', status: 'sending' });
    const result = reviveEntries([old, mid], now, null);
    expect(result[0].status).toBe('pending');
    expect(result[1].status).toBe('uncertain');
  });

  it('keeps pending entries from today untouched and leaves failed entries failed', () => {
    const failed = entry({ id: 'f', status: 'failed', failure: { reason: 'server', message: 'x' } });
    const result = reviveEntries([entry({ id: 'p' }), failed], now, 'UTC');
    expect(result[0].status).toBe('pending');
    expect(result[1]).toEqual(failed);
  });
});

describe('expireEntries', () => {
  const now = new Date('2026-10-05T12:00:00Z');

  it('fails pending and uncertain entries from an earlier day but leaves sending ones for the in-flight request', () => {
    const list = [
      entry({ id: 'p', accountDate: '2026-10-04' }),
      entry({ id: 'u', accountDate: '2026-10-04', status: 'uncertain' }),
      entry({ id: 's', accountDate: '2026-10-04', status: 'sending' }),
    ];
    const result = expireEntries(list, now, 'UTC');
    expect(result.map(e => e.status)).toEqual(['failed', 'failed', 'sending']);
    expect(result[0].failure?.reason).toBe('day-passed');
  });

  it('returns the same array when nothing expired', () => {
    const list = [entry()];
    expect(expireEntries(list, now, 'UTC')).toBe(list);
  });
});

describe('describeEntry', () => {
  it('names each kind of write in plain words', () => {
    expect(describeEntry(entry({ kind: 'complete' }))).toBe('Complete');
    expect(describeEntry(entry({ kind: 'undo' }))).toBe('Undo');
    expect(describeEntry(entry({ kind: 'recovery' }))).toBe('Recovery');
  });

  it('shows the size and direction of a progress change', () => {
    expect(describeEntry(entry({ kind: 'progress', delta: 2, base: 0 }))).toBe('Progress +2');
    expect(describeEntry(entry({ kind: 'progress', delta: -3, base: 5 }))).toBe('Progress −3');
  });
});

const REVISION = { userId: USER, ageVersion: 1, consentVersion: 2, authorityVersion: 3 };
const TARGETS = [{ kind: 'habit' as const, id: 'h1', inputKind: 'basic' as const }];

describe('tracker consent in the queue model', () => {
  it('has a purpose-paused message that keeps the entry, names the original date, and points to Retry', () => {
    const message = FAILURE_MESSAGES['purpose-paused'];
    expect(message).toMatch(/kept/i);
    expect(message).toMatch(/Retry/);
    expect(message).toMatch(/original date/i);
  });

  it('stores the captured revision and targets on a new entry', () => {
    const [created] = enqueue([], input({ trackerRevision: REVISION, trackerTargets: TARGETS }));
    expect(created.trackerRevision).toEqual(REVISION);
    expect(created.trackerTargets).toEqual(TARGETS);
  });

  it('folds progress under the same captured revision into one entry', () => {
    const first = enqueue([], input({ id: 'a', kind: 'progress', delta: 1, base: 0, trackerRevision: REVISION, trackerTargets: TARGETS }));
    const next = enqueue(first, input({ id: 'b', kind: 'progress', delta: 2, base: 1, trackerRevision: { ...REVISION }, trackerTargets: TARGETS }));
    expect(next).toHaveLength(1);
    expect(next[0].delta).toBe(3);
  });

  it('does not fold progress made under a newer revision into an older entry', () => {
    const first = enqueue([], input({ id: 'a', kind: 'progress', delta: 1, base: 0, trackerRevision: REVISION, trackerTargets: TARGETS }));
    const next = enqueue(first, input({ id: 'b', kind: 'progress', delta: 2, base: 1, trackerRevision: { ...REVISION, consentVersion: 3 }, trackerTargets: TARGETS }));
    expect(next.map(e => [e.id, e.delta])).toEqual([['a', 1], ['b', 2]]);
    expect(next[0].trackerRevision).toEqual(REVISION);
  });

  it('classifies ET002 and ET003 as purpose-paused and leaves ET001 as tracker-paused', () => {
    expect(classifyError('complete', { code: 'ET002', message: 'x' })).toEqual(expect.objectContaining({ type: 'failed', reason: 'purpose-paused' }));
    expect(classifyError('progress', { code: 'ET003', message: 'x' })).toEqual(expect.objectContaining({ type: 'failed', reason: 'purpose-paused' }));
    expect(classifyError('complete', { code: 'ET001', message: 'x' })).toEqual(expect.objectContaining({ type: 'failed', reason: 'tracker-paused' }));
  });

  it('never counts a 22023 as already recorded, because completeHabit has already settled a real duplicate', () => {
    expect(classifyError('complete', { code: '22023', message: 'Invalid tracker input.' }).type).not.toBe('applied');
    expect(classifyError('undo', { code: '22023', message: 'Invalid tracker input.' }).type).not.toBe('applied');
    expect(classifyError('progress', { code: '22023', message: 'Invalid tracker input.' }).type).not.toBe('applied');
  });

  it('settles a 42501 target-unavailable refusal after the delete own earlier attempt, never retrying it', () => {
    const error = { code: '42501', message: 'Tracker target unavailable.' };
    expect(classifyError('delete', error, true)).toEqual({ type: 'applied' });
    expect(classifyError('delete', error, false)).toEqual(expect.objectContaining({ type: 'failed', reason: 'not-on-board' }));
    expect(classifyError('complete', error, true)).toEqual(expect.objectContaining({ type: 'failed', reason: 'not-on-board' }));
  });

  it('keeps either held flag on the original date, recoveries included', () => {
    const later = new Date('2026-10-06T12:00:00Z');
    expect(isExpired(entry({ kind: 'recovery', heldForProcessingPause: true }), later, 'UTC')).toBe(true);
    expect(isExpired(entry({ kind: 'recovery', heldForTrackerPause: true }), later, 'UTC')).toBe(true);
    expect(isExpired(entry({ kind: 'recovery' }), later, 'UTC')).toBe(false);
  });

  it('expires a failed processing-held entry that reaches a later day, with the original-day wording', () => {
    const held = entry({ status: 'failed', heldForProcessingPause: true, failure: { reason: 'purpose-paused', message: 'x' } });
    const [result] = expireEntries([held], new Date('2026-10-06T12:00:00Z'), 'UTC');
    expect(result.failure?.reason).toBe('day-passed');
    expect(result.failure?.message).toContain('original account day');
  });

  describe('decoding', () => {
    const full = entry({ trackerRevision: REVISION, trackerTargets: TARGETS, heldForProcessingPause: true, status: 'failed', failure: { reason: 'purpose-paused', message: 'm' } });

    it('round-trips entries with the new optional fields untouched', () => {
      expect(decodeQueue(encodeQueue([full]), USER)).toEqual([full]);
    });

    it('accepts an old v1 entry without the new fields and does not relabel or stamp it', () => {
      const old = entry({ id: 'old' });
      const [decoded] = decodeQueue(encodeQueue([old]), USER);
      expect(decoded).toEqual(old);
      expect(decoded.trackerRevision).toBeUndefined();
      expect(decoded.trackerTargets).toBeUndefined();
      expect(decoded.heldForProcessingPause).toBeUndefined();
    });

    it('rejects a heldForProcessingPause value other than true', () => {
      const raw = JSON.stringify({ v: 1, entries: [{ ...entry({ id: 'x' }), heldForProcessingPause: false }, entry({ id: 'ok' })] });
      expect(decodeQueue(raw, USER).map(e => e.id)).toEqual(['ok']);
    });

    it.each([
      ['a revision missing a field', { userId: USER, ageVersion: 1, consentVersion: 1 }],
      ['a revision with a string version', { ...REVISION, consentVersion: '2' }],
      ['a revision with a negative version', { ...REVISION, consentVersion: -1 }],
      ['a revision belonging to another account', { ...REVISION, userId: 'someone-else' }],
      ['a non-object revision', 'rev'],
    ])('keeps the entry but drops %s, so it is treated as having no captured grant', (_name, revision) => {
      const raw = JSON.stringify({ v: 1, entries: [{ ...entry({ id: 'keep' }), trackerRevision: revision, trackerTargets: TARGETS }] });
      const [decoded] = decodeQueue(raw, USER);
      expect(decoded.id).toBe('keep');
      expect(decoded.trackerRevision).toBeUndefined();
    });

    it('drops malformed target lists but keeps the entry and its valid revision', () => {
      for (const targets of ['x', [{ kind: 'habit', id: 'h1' }], [{ kind: 'weekly', id: 'h1', inputKind: 'basic' }], [null]]) {
        const raw = JSON.stringify({ v: 1, entries: [{ ...entry({ id: 'keep' }), trackerRevision: REVISION, trackerTargets: targets }] });
        const [decoded] = decodeQueue(raw, USER);
        expect(decoded.id).toBe('keep');
        expect(decoded.trackerRevision).toEqual(REVISION);
        expect(decoded.trackerTargets).toBeUndefined();
      }
    });

    it('does not carry the full capability through storage', () => {
      const withCapability = { ...entry(), trackerRevision: { ...REVISION, canWriteBasic: true, canWriteCustom: true } };
      const [decoded] = decodeQueue(JSON.stringify({ v: 1, entries: [withCapability] }), USER);
      expect(decoded.trackerRevision).toEqual(REVISION);
    });
  });
});

describe('held-entry retention (30 days)', () => {
  const T0 = Date.UTC(2026, 8, 1);
  const held = (overrides: Partial<QueueEntry> = {}): QueueEntry => entry({
    id: 'h', status: 'failed', heldForProcessingPause: true, heldAt: T0, label: 'Secret quest', delta: 2, base: 1,
    kind: 'progress', failure: { reason: 'purpose-paused', message: 'x' }, ...overrides,
  });

  it('is exactly thirty days', () => {
    expect(HELD_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('keeps a hold at 30 days minus 1 ms and exactly 30 days, and expires it at plus 1 ms', () => {
    const list = [held()];
    expect(expireHeldEntries(list, T0 + HELD_RETENTION_MS - 1).expired).toEqual([]);
    expect(expireHeldEntries(list, T0 + HELD_RETENTION_MS).expired).toEqual([]);
    const result = expireHeldEntries(list, T0 + HELD_RETENTION_MS + 1);
    expect(result.entries).toEqual([]);
    expect(result.expired.map(e => e.id)).toEqual(['h']);
  });

  it('returns the same array when nothing expired', () => {
    const list = [held()];
    expect(expireHeldEntries(list, T0 + 1).entries).toBe(list);
  });

  it('expires tracker-paused holds and holds that already ended as day-passed', () => {
    const list = [
      held({ id: 'a', heldForProcessingPause: undefined, heldForTrackerPause: true, failure: { reason: 'tracker-paused', message: 'x' } }),
      held({ id: 'b', failure: { reason: 'day-passed', message: 'x' } }),
    ];
    expect(expireHeldEntries(list, T0 + HELD_RETENTION_MS + 1).entries).toEqual([]);
  });

  it('never touches ordinary entries, however old, or a hold released by Retry', () => {
    const list = [
      entry({ id: 'p', createdAt: 1 }),
      entry({ id: 'u', status: 'uncertain', createdAt: 1 }),
      entry({ id: 'f', status: 'failed', createdAt: 1, failure: { reason: 'server', message: 'x' } }),
      held({ id: 'released', status: 'uncertain', failure: undefined }),
    ];
    const far = T0 + 10 * HELD_RETENTION_MS;
    expect(expireHeldEntries(list, far).entries).toBe(list);
  });

  it('expires only the held entries of a mixed list', () => {
    const result = expireHeldEntries([entry({ id: 'p' }), held()], T0 + HELD_RETENTION_MS + 1);
    expect(result.entries.map(e => e.id)).toEqual(['p']);
  });

  it('keeps a hold when the clock moved backwards or the stamp is missing', () => {
    expect(expireHeldEntries([held()], T0 - 5).expired).toEqual([]);
    expect(expireHeldEntries([held({ heldAt: undefined })], T0 + 10 * HELD_RETENTION_MS).expired).toEqual([]);
  });

  it('reports each expired entry without its label, payload or captured permission', () => {
    const [notice] = expireHeldEntries([held({
      trackerRevision: { userId: USER, ageVersion: 1, consentVersion: 1, authorityVersion: 1 },
      trackerTargets: [{ kind: 'habit', id: 'h1', inputKind: 'custom' }],
    })], T0 + HELD_RETENTION_MS + 1).expired;
    expect(notice.failure?.reason).toBe('hold-expired');
    expect(notice.failure?.message).toBe(FAILURE_MESSAGES['hold-expired']);
    expect(notice).toEqual(expect.objectContaining({ id: 'h', habitId: 'h1', status: 'failed' }));
    expect(JSON.stringify(notice)).not.toContain('Secret quest');
    for (const key of ['label', 'delta', 'base', 'trackerRevision', 'trackerTargets']) expect(notice).not.toHaveProperty(key);
  });

  describe('decoding', () => {
    it('round-trips heldAt', () => {
      const e = held();
      expect(decodeQueue(encodeQueue([e]), USER, T0 + 5)).toEqual([e]);
    });

    it('stamps a held entry that has no timestamp with the load time, so it is never expired at once', () => {
      const old = held({ heldAt: undefined });
      const loadedAt = T0 + 40 * 24 * 60 * 60 * 1000;
      const [decoded] = decodeQueue(encodeQueue([old]), USER, loadedAt);
      expect(decoded.heldAt).toBe(loadedAt);
      expect(expireHeldEntries([decoded], loadedAt).expired).toEqual([]);
    });

    it('replaces an unreadable timestamp with the load time and still decodes the entry', () => {
      const raw = JSON.stringify({ v: 1, entries: [{ ...held(), heldAt: 'yesterday' }, { ...held({ id: 'n' }), heldAt: Number.NaN }] });
      expect(decodeQueue(raw, USER, 77).map(e => e.heldAt)).toEqual([77, 77]);
    });

    it('does not stamp entries that are not held, and does not invent a stamp without a load time', () => {
      expect(decodeQueue(encodeQueue([entry()]), USER, 77)[0]).not.toHaveProperty('heldAt');
      expect(decodeQueue(encodeQueue([held({ heldAt: undefined })]), USER)[0]).not.toHaveProperty('heldAt');
    });

    it('still decodes a valid old (pre-heldAt) entry', () => {
      const raw = JSON.stringify({ v: 1, entries: [entry({ id: 'old' })] });
      expect(decodeQueue(raw, USER, 5).map(e => e.id)).toEqual(['old']);
    });
  });
});
