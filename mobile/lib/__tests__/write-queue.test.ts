import type { Quest } from '@eiyu/shared';
import {
  applyOverlay,
  describeEntry,
  classifyError,
  decodeQueue,
  encodeQueue,
  expireEntries,
  enqueue,
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

  it('fails every kind when the quest is no longer on the board', () => {
    for (const kind of ['complete', 'undo', 'progress', 'recovery'] as const) {
      expect(resolveUncertain(entry({ kind, delta: 1, base: 0 }), undefined)).toEqual({ action: 'fail', reason: 'not-on-board' });
    }
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
