import type { Quest, TrackerAccess, TrackerTarget } from '@eiyu/shared';
import { writeQueueKey, createWriteQueueEngine, type EnqueueRequest, type WriteQueueDeps, type WriteQueueEngine } from '../write-queue-engine';
import { decodeQueue, encodeQueue, type QueueEntry } from '../write-queue';

const KEY = 'eiyu.writeQueue.v1.user-1';
const DAY1 = new Date('2026-10-05T12:00:00Z');
const DAY2 = new Date('2026-10-06T12:00:00Z');

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'h1', name: 'Run', stat: 'vitality', difficulty: 'easy', easyVersion: null, description: null,
    questType: 'habit', time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], streak: 0, frozen: false,
    completed: false, targetCount: null, progressCount: 0, ...overrides,
  } as Quest;
}

const REVISION = { userId: 'user-1', ageVersion: 1, consentVersion: 1, authorityVersion: 1 };
const snap = (id: string, inputKind: 'basic' | 'custom' = 'basic') => ({ kind: 'habit' as const, id, inputKind });

function access(overrides: Partial<TrackerAccess> = {}): TrackerAccess {
  return {
    contractVersion: 1, revision: REVISION, canWriteBasic: true, customConsent: false, fitnessConsent: false,
    customAuthorityState: 'not-required', fitnessAuthorityState: 'not-required', canWriteCustom: false, canWriteFitness: false,
    ...overrides,
  };
}

function target(id: string, overrides: Partial<TrackerTarget> = {}): TrackerTarget {
  return { kind: 'habit', id, inputKind: 'basic', canWrite: true, ...overrides };
}

/** A permission check that answers from the entry's own captured targets, so nothing differs unless a test says so. */
function gate(allowed: () => boolean | Promise<boolean>): WriteQueueDeps['checkProcessingAccess'] {
  return async entry => {
    const canWriteBasic = await allowed();
    return { access: access({ canWriteBasic }), targets: (entry.trackerTargets ?? [snap(entry.habitId)]).map(t => target(t.id, { inputKind: t.inputKind })) };
  };
}

/** The engine as tests drive it: permission defaults to an ordinary writable basic quest unless a test says otherwise. */
type TestEnqueue = Omit<EnqueueRequest, 'trackerAccess' | 'trackerTargets'> & Partial<Pick<EnqueueRequest, 'trackerAccess' | 'trackerTargets'>>;
type TestEngine = Omit<WriteQueueEngine, 'enqueue'> & { enqueue(request: TestEnqueue): boolean };

function stored(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'stored-1', userId: 'user-1', kind: 'complete', habitId: 'h1', accountDate: '2026-10-05',
    createdAt: 1, attempts: 0, status: 'pending',
    trackerRevision: REVISION, trackerTargets: [snap(overrides.habitId ?? 'h1')], ...overrides,
  };
}

function setup(overrides: Partial<WriteQueueDeps> = {}, initial?: QueueEntry[]) {
  const store = new Map<string, string>();
  if (initial) store.set(KEY, encodeQueue(initial));
  let clock = DAY1;
  let counter = 0;
  const calls: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const snapshotsAtSend: QueueEntry[][] = [];
  const deps: WriteQueueDeps = {
    userId: 'user-1',
    storage: {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
      removeItem: jest.fn(async (key: string) => { store.delete(key); }),
    },
    now: () => clock,
    timeZone: () => 'UTC',
    isOnline: () => true,
    newId: () => `id-${++counter}`,
    send: jest.fn(async (entry: QueueEntry) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      calls.push(`${entry.kind}:${entry.habitId}`);
      snapshotsAtSend.push(decodeQueue(store.get(KEY), 'user-1'));
      await Promise.resolve();
      inFlight -= 1;
    }),
    readQuest: jest.fn(async () => quest()),
    onApplied: jest.fn(async () => {}),
    checkProcessingAccess: gate(() => true),
    ...overrides,
  };
  const raw = createWriteQueueEngine(deps);
  // Tests that do not care about permission enqueue as an ordinary writable basic quest.
  const engine: TestEngine = {
    ...raw,
    enqueue: request => raw.enqueue({ trackerAccess: access(), trackerTargets: [snap(request.habitId)], ...request }),
  };
  return {
    engine, deps, store, calls, snapshotsAtSend,
    setClock: (d: Date) => { clock = d; },
    maxInFlight: () => maxInFlight,
    persisted: () => decodeQueue(store.get(KEY), 'user-1'),
  };
}

const network = () => Object.assign(new Error('Network request failed'), {});

describe('tracker pause and explicit retry', () => {
  it('uses the newest folded action after the access request finishes', async () => {
    let release: (value: boolean) => void = () => {};
    const t = setup({ checkProcessingAccess: gate(() => new Promise<boolean>(resolve => { release = resolve; })) });
    await t.engine.load(); t.engine.enqueue({ kind: 'progress', habitId: 'h1', delta: 1, base: 0 });
    const flushing = t.engine.flush(); await new Promise(resolve => setTimeout(resolve, 0));
    t.engine.enqueue({ kind: 'progress', habitId: 'h1', delta: 2, base: 1 });
    release(true); await flushing;
    expect(t.deps.send).toHaveBeenCalledWith(expect.objectContaining({ delta: 3, base: 0 }));
  });

  it('does not send an age-held recovery if its reconciliation crosses midnight', async () => {
    let allowed = false;
    const t = setup({ checkProcessingAccess: gate(() => allowed) }, [stored({ kind: 'recovery' })]);
    await t.engine.load(); await t.engine.flush(); allowed = true;
    (t.deps.readQuest as jest.Mock).mockImplementation(async () => { t.setClock(DAY2); return quest(); });
    expect(await t.engine.retry('stored-1')).toBe(true); await t.engine.flush();
    expect(t.deps.send).not.toHaveBeenCalled();
    expect(t.engine.getEntries()[0].failure?.reason).toBe('day-passed');
  });
  it('retains every held action and requires Retry after access returns', async () => {
    let allowed = false;
    const t = setup({ checkProcessingAccess: gate(() => allowed) }, [stored(), stored({ id: 'second', habitId: 'h2' })]);
    await t.engine.load(); await t.engine.flush();
    expect(t.deps.send).not.toHaveBeenCalled();
    expect(t.engine.getEntries()).toHaveLength(2);
    expect(t.engine.getEntries().map(e => [e.status, e.failure?.reason])).toEqual([['failed', 'tracker-paused'], ['failed', 'tracker-paused']]);
    allowed = true; await t.engine.flush();
    expect(t.deps.send).not.toHaveBeenCalled();
    expect(await t.engine.retry('stored-1')).toBe(true); await t.engine.flush();
    expect(t.deps.readQuest).toHaveBeenCalledWith('h1');
    expect(t.deps.send).toHaveBeenCalledTimes(1);
    expect(t.engine.getEntries().map(e => e.id)).toEqual(['second']);
  });

  it('does not duplicate progress that committed before its uncertain action was held', async () => {
    let allowed = false;
    const t = setup({ checkProcessingAccess: gate(() => allowed), readQuest: jest.fn(async () => quest({ targetCount: 5, progressCount: 3 })) },
      [stored({ status: 'uncertain', kind: 'progress', delta: 2, base: 1 })]);
    await t.engine.load(); await t.engine.flush();
    expect(t.deps.readQuest).not.toHaveBeenCalled();
    allowed = true; expect(await t.engine.retry('stored-1')).toBe(true); await t.engine.flush();
    expect(t.deps.send).not.toHaveBeenCalled();
    expect(t.engine.getEntries()).toEqual([]);
    expect(t.deps.onApplied).toHaveBeenCalledTimes(1);
  });

  it.each(['complete', 'recovery'] as const)('keeps the original day and refuses expired held %s actions', async kind => {
    let allowed = false;
    const t = setup({ checkProcessingAccess: gate(() => allowed) }, [stored({ kind })]);
    await t.engine.load(); await t.engine.flush();
    allowed = true; t.setClock(DAY2); await t.engine.flush();
    expect(await t.engine.retry('stored-1')).toBe(false);
    expect(t.engine.getEntries()[0]).toEqual(expect.objectContaining({ accountDate: '2026-10-05', status: 'failed', failure: expect.objectContaining({ reason: 'day-passed' }) }));
    expect(t.engine.getEntries()[0].failure?.message).toContain('original account day');
    expect(t.deps.send).not.toHaveBeenCalled();
  });

  it('does not send or discard entries when access cannot be checked', async () => {
    const t = setup({ checkProcessingAccess: async () => { throw network(); } }, [stored()]);
    await t.engine.load(); await expect(t.engine.flush()).resolves.toBeUndefined();
    expect(t.deps.send).not.toHaveBeenCalled(); expect(t.engine.getEntries()).toEqual([stored()]);
  });

  it('stops after an owner switch while the access check was pending', async () => {
    let release: (value: boolean) => void = () => {};
    const t = setup({ checkProcessingAccess: gate(() => new Promise<boolean>(resolve => { release = resolve; })) }, [stored()]);
    await t.engine.load(); const flushing = t.engine.flush();
    await new Promise(resolve => setTimeout(resolve, 0)); t.engine.dispose(); release(true); await flushing;
    expect(t.deps.send).not.toHaveBeenCalled();
  });

  it('holds the whole queue when a birthday change wins after preflight', async () => {
    const t = setup({ send: jest.fn(async () => { throw { code: 'ET001', message: 'Tracker updates are paused.' }; }) }, [stored(), stored({ id: 'second', habitId: 'h2' })]);
    await t.engine.load(); await t.engine.flush();
    expect(t.deps.send).toHaveBeenCalledTimes(1);
    expect(t.engine.getEntries().map(e => e.failure?.reason)).toEqual(['tracker-paused', 'tracker-paused']);
  });

  it('retains held actions across restart without automatic replay', async () => {
    const t = setup({ checkProcessingAccess: gate(() => false) }, [stored()]);
    await t.engine.load(); await t.engine.flush(); await new Promise(resolve => setTimeout(resolve, 0));
    const restarted = setup({}, t.persisted());
    await restarted.engine.load(); await restarted.engine.flush();
    expect(restarted.deps.send).not.toHaveBeenCalled();
    expect(restarted.engine.getEntries()).toHaveLength(1);
  });
});

describe('write queue engine', () => {
  afterEach(() => { jest.useRealTimers(); });

  describe('enqueue and persistence', () => {
    it('stores a new entry under the per-user key before anything is sent', async () => {
      const t = setup();
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(t.persisted()).toEqual([expect.objectContaining({ id: 'id-1', kind: 'complete', habitId: 'h1', accountDate: '2026-10-05', status: 'pending' })]);
      expect(t.deps.send).not.toHaveBeenCalled();
    });

    it('survives a storage write failure and keeps working in memory', async () => {
      const t = setup({ storage: { getItem: async () => null, setItem: async () => { throw new Error('disk full'); }, removeItem: async () => { throw new Error('disk full'); } } });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      await expect(t.engine.flush()).resolves.toBeUndefined();
      expect(t.deps.send).toHaveBeenCalledTimes(1);
      expect(t.engine.getEntries()).toEqual([]);
    });

    it('ignores a persisted queue that belongs to another user', async () => {
      const t = setup({}, [stored({ userId: 'someone-else' })]);
      await t.engine.load();
      expect(t.engine.getEntries()).toEqual([]);
    });

    it('notifies subscribers of changes until they unsubscribe', async () => {
      const t = setup();
      await t.engine.load();
      const listener = jest.fn();
      const off = t.engine.subscribe(listener);
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      expect(listener).toHaveBeenCalledWith([expect.objectContaining({ habitId: 'h1' })]);
      off();
      listener.mockClear();
      t.engine.enqueue({ kind: 'complete', habitId: 'h2' });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('cold start', () => {
    it('keeps entries persisted by an earlier session when a write is made before load() is even called', async () => {
      const t = setup({ isOnline: () => false }, [stored({ id: 'old', habitId: 'h-old', createdAt: 1 })]);
      t.engine.enqueue({ kind: 'complete', habitId: 'h-new' });
      await t.engine.load();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(t.engine.getEntries().map(e => e.habitId)).toEqual(['h-old', 'h-new']);
      expect(t.persisted().map(e => e.habitId)).toEqual(['h-old', 'h-new']);
    });

    it('keeps them too when the read is slow and the write comes first', async () => {
      let release: (value: string | null) => void = () => {};
      const initial = encodeQueue([stored({ id: 'old', habitId: 'h-old', createdAt: 1 })]);
      const store = new Map<string, string>([[KEY, initial]]);
      const t = setup({
        isOnline: () => false,
        storage: {
          getItem: jest.fn(() => new Promise<string | null>(resolve => { release = resolve; })),
          setItem: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
          removeItem: jest.fn(async (key: string) => { store.delete(key); }),
        },
      });
      t.engine.enqueue({ kind: 'complete', habitId: 'h-new' });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(store.get(KEY)).toBe(initial);
      release(initial);
      await t.engine.load();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(decodeQueue(store.get(KEY), 'user-1').map(e => e.habitId)).toEqual(['h-old', 'h-new']);
    });

    it('does not duplicate an entry that is both in storage and already in memory', async () => {
      const t = setup({ isOnline: () => false }, [stored({ id: 'same' })]);
      await t.engine.load();
      await t.engine.load();
      expect(t.engine.getEntries().map(e => e.id)).toEqual(['same']);
    });

    it('sends the old entry before the new one when the device is online', async () => {
      let release: (value: string | null) => void = () => {};
      const initialRaw = encodeQueue([stored({ id: 'old', habitId: 'h-old', createdAt: 1 })]);
      const store = new Map<string, string>([[KEY, initialRaw]]);
      const t = setup({
        storage: {
          getItem: jest.fn(() => new Promise<string | null>(resolve => { release = resolve; })),
          setItem: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
          removeItem: jest.fn(async (key: string) => { store.delete(key); }),
        },
      });
      t.engine.enqueue({ kind: 'complete', habitId: 'h-new' });
      const flushing = t.engine.flush();
      release(initialRaw);
      await t.engine.load();
      await flushing;
      expect(t.calls).toEqual(['complete:h-old', 'complete:h-new']);
      expect(store.has(KEY)).toBe(false);
    });
  });

  describe('storage writes', () => {
    it('coalesces changes that arrive while a write is waiting, and the last write holds the newest state', async () => {
      const store = new Map<string, string>();
      const writes: number[] = [];
      const t = setup({
        isOnline: () => false,
        storage: {
          getItem: jest.fn(async () => null),
          setItem: jest.fn(async (key: string, value: string) => {
            await new Promise(resolve => setTimeout(resolve, 20));
            store.set(key, value);
            writes.push(decodeQueue(value, 'user-1').length);
          }),
          removeItem: jest.fn(async (key: string) => { store.delete(key); }),
        },
      });
      await t.engine.load();
      for (const habitId of ['a', 'b', 'c', 'd', 'e']) t.engine.enqueue({ kind: 'complete', habitId });
      await new Promise(resolve => setTimeout(resolve, 200));
      expect(writes.length).toBeLessThanOrEqual(2);
      expect(writes[writes.length - 1]).toBe(5);
      expect(decodeQueue(store.get(KEY), 'user-1')).toHaveLength(5);
    });

    it('still writes again for a change made after a write has started', async () => {
      const t = setup({ isOnline: () => false });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'a' });
      await new Promise(resolve => setTimeout(resolve, 0));
      t.engine.enqueue({ kind: 'complete', habitId: 'b' });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(t.persisted().map(e => e.habitId)).toEqual(['a', 'b']);
    });
  });

  describe('flush', () => {
    it('hands the result of the request to the applied hook', async () => {
      const t = setup({ send: jest.fn(async () => 7) });
      await t.engine.load();
      t.engine.enqueue({ kind: 'progress', habitId: 'h1', delta: 1, base: 6 });
      await t.engine.flush();
      expect(t.deps.onApplied).toHaveBeenCalledWith(expect.objectContaining({ kind: 'progress' }), 7);
    });

    it('sends entries in the order they were made, one at a time, and clears storage', async () => {
      const t = setup();
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      t.engine.enqueue({ kind: 'complete', habitId: 'h2' });
      t.engine.enqueue({ kind: 'progress', habitId: 'h3', delta: 1, base: 0 });
      await t.engine.flush();
      expect(t.calls).toEqual(['complete:h1', 'complete:h2', 'progress:h3']);
      expect(t.maxInFlight()).toBe(1);
      expect(t.engine.getEntries()).toEqual([]);
      expect(t.store.has(KEY)).toBe(false);
      expect(t.deps.onApplied).toHaveBeenCalledTimes(3);
    });

    it('persists the entry as sending before the request goes out', async () => {
      const t = setup();
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      await t.engine.flush();
      expect(t.snapshotsAtSend[0]).toEqual([expect.objectContaining({ status: 'sending', attempts: 1 })]);
    });

    it('does not send while the device is known to be offline', async () => {
      const t = setup({ isOnline: () => false });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      await t.engine.flush();
      expect(t.deps.send).not.toHaveBeenCalled();
      expect(t.engine.getEntries()[0].status).toBe('pending');
    });

    it('tries to send when connectivity is unknown', async () => {
      const t = setup({ isOnline: () => null });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      await t.engine.flush();
      expect(t.deps.send).toHaveBeenCalledTimes(1);
    });

    it('runs one flush at a time even when called twice', async () => {
      const t = setup();
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      t.engine.enqueue({ kind: 'complete', habitId: 'h2' });
      await Promise.all([t.engine.flush(), t.engine.flush()]);
      expect(t.deps.send).toHaveBeenCalledTimes(2);
      expect(t.maxInFlight()).toBe(1);
    });

    it('picks up an entry enqueued while a flush is running', async () => {
      let engineRef: ReturnType<typeof setup>['engine'];
      let first = true;
      const t = setup({
        send: jest.fn(async () => {
          if (first) { first = false; engineRef.enqueue({ kind: 'complete', habitId: 'late' }); }
        }),
      });
      engineRef = t.engine;
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      await t.engine.flush();
      expect(t.deps.send).toHaveBeenCalledTimes(2);
      expect(t.engine.getEntries()).toEqual([]);
    });

    it('removes the entry even when the applied hook throws', async () => {
      const t = setup({ onApplied: jest.fn(async () => { throw new Error('refetch failed'); }) });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      await t.engine.flush();
      expect(t.engine.getEntries()).toEqual([]);
    });

    it('keeps the entry sending while the applied hook runs, so the board never flickers back', async () => {
      let resolveApplied: () => void = () => {};
      const seen: string[] = [];
      const t = setup({ onApplied: jest.fn(() => new Promise<void>(resolve => { resolveApplied = resolve; })) });
      await t.engine.load();
      t.engine.subscribe(entries => seen.push(entries.map(e => e.status).join(',')));
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      const done = t.engine.flush();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(t.engine.getEntries()).toEqual([expect.objectContaining({ status: 'sending' })]);
      resolveApplied();
      await done;
      expect(t.engine.getEntries()).toEqual([]);
    });
  });

  describe('network failures', () => {
    it('marks the entry uncertain and stops the run, leaving later entries untouched', async () => {
      const t = setup({ send: jest.fn(async () => { throw network(); }) });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      t.engine.enqueue({ kind: 'complete', habitId: 'h2' });
      await t.engine.flush();
      expect(t.deps.send).toHaveBeenCalledTimes(1);
      expect(t.engine.getEntries().map(e => e.status)).toEqual(['uncertain', 'pending']);
      expect(t.persisted().map(e => e.status)).toEqual(['uncertain', 'pending']);
    });

    it('re-reads the server before resending an uncertain entry and drops it if it already landed', async () => {
      const t = setup({ readQuest: jest.fn(async () => quest({ completed: true })) }, [stored({ status: 'uncertain' })]);
      await t.engine.load();
      await t.engine.flush();
      expect(t.deps.readQuest).toHaveBeenCalledWith('h1');
      expect(t.deps.send).not.toHaveBeenCalled();
      expect(t.engine.getEntries()).toEqual([]);
      expect(t.deps.onApplied).toHaveBeenCalledTimes(1);
    });

    it('sends an uncertain progress entry only when the server still holds the base count', async () => {
      const entry = stored({ kind: 'progress', delta: 2, base: 1, status: 'uncertain' });
      const still = setup({ readQuest: jest.fn(async () => quest({ targetCount: 5, progressCount: 1 })) }, [entry]);
      await still.engine.load();
      await still.engine.flush();
      expect(still.deps.send).toHaveBeenCalledTimes(1);

      const landed = setup({ readQuest: jest.fn(async () => quest({ targetCount: 5, progressCount: 3 })) }, [entry]);
      await landed.engine.load();
      await landed.engine.flush();
      expect(landed.deps.send).not.toHaveBeenCalled();
      expect(landed.engine.getEntries()).toEqual([]);
    });

    it('fails an uncertain progress entry instead of guessing when the count moved elsewhere', async () => {
      const t = setup({ readQuest: jest.fn(async () => quest({ targetCount: 5, progressCount: 4 })) }, [stored({ kind: 'progress', delta: 2, base: 1, status: 'uncertain' })]);
      await t.engine.load();
      await t.engine.flush();
      expect(t.deps.send).not.toHaveBeenCalled();
      expect(t.engine.getEntries()[0]).toEqual(expect.objectContaining({ status: 'failed', failure: expect.objectContaining({ reason: 'progress-changed' }) }));
    });

    it('stays uncertain and sends nothing when the verification read is offline', async () => {
      const t = setup({ readQuest: jest.fn(async () => { throw network(); }) }, [stored({ status: 'uncertain' }), stored({ id: 'stored-2', habitId: 'h2' })]);
      await t.engine.load();
      await t.engine.flush();
      expect(t.deps.send).not.toHaveBeenCalled();
      expect(t.engine.getEntries().map(e => e.status)).toEqual(['uncertain', 'pending']);
    });

    it('turns a write caught mid-send by an app kill into an uncertain entry on the next launch', async () => {
      const t = setup({ readQuest: jest.fn(async () => quest({ targetCount: 5, progressCount: 3 })) }, [stored({ kind: 'progress', delta: 2, base: 1, status: 'sending' })]);
      await t.engine.load();
      expect(t.engine.getEntries()[0].status).toBe('uncertain');
      await t.engine.flush();
      expect(t.deps.send).not.toHaveBeenCalled();
    });
  });

  describe('account day boundary', () => {
    it('fails entries from an earlier day when they load and never sends them', async () => {
      const t = setup({}, [stored({ accountDate: '2026-10-04' })]);
      await t.engine.load();
      await t.engine.flush();
      expect(t.deps.send).not.toHaveBeenCalled();
      expect(t.engine.getEntries()[0]).toEqual(expect.objectContaining({ status: 'failed', failure: expect.objectContaining({ reason: 'day-passed' }) }));
    });

    it('fails an entry whose day ended between enqueue and flush', async () => {
      const t = setup({ isOnline: () => false });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      t.setClock(DAY2);
      await t.engine.flush();
      expect(t.deps.send).not.toHaveBeenCalled();
      expect(t.engine.getEntries()[0].failure?.reason).toBe('day-passed');
    });

    it('sweep expires old entries without a flush', async () => {
      const t = setup({ isOnline: () => false });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      t.setClock(DAY2);
      t.engine.sweep();
      expect(t.engine.getEntries()[0].status).toBe('failed');
    });

    it('stamps a new entry with the account-zone date, not the device date', async () => {
      const t = setup({ timeZone: () => 'Pacific/Auckland' });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      expect(t.engine.getEntries()[0].accountDate).toBe('2026-10-06');
    });
  });

  describe('unknown account zone', () => {
    it('neither expires nor sends anything until the account zone is known', async () => {
      let zone: string | null = null;
      const t = setup({ timeZone: () => zone }, [stored({ accountDate: '2026-10-06' })]);
      await t.engine.load();
      await t.engine.flush();
      expect(t.deps.send).not.toHaveBeenCalled();
      expect(t.engine.getEntries()[0].status).toBe('pending');
      // Account zone Auckland: today there is 2026-10-06 while UTC still says 10-05, so the entry is current.
      zone = 'Pacific/Auckland';
      await t.engine.flush();
      expect(t.deps.send).toHaveBeenCalledTimes(1);
      expect(t.engine.getEntries()).toEqual([]);
    });

    it('expires an old entry only once the zone is known', async () => {
      let zone: string | null = null;
      const t = setup({ timeZone: () => zone, isOnline: () => false }, [stored({ accountDate: '2026-10-04' })]);
      await t.engine.load();
      t.engine.sweep();
      expect(t.engine.getEntries()[0].status).toBe('pending');
      zone = 'UTC';
      t.engine.sweep();
      expect(t.engine.getEntries()[0].status).toBe('failed');
    });

    it('ignores a write made before the zone is known instead of guessing a day for it', async () => {
      const t = setup({ timeZone: () => null });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      expect(t.engine.getEntries()).toEqual([]);
    });
  });

  describe('server rejections', () => {
    it('fails a refused entry with a reason and carries on with the rest', async () => {
      const send = jest.fn(async (entry: QueueEntry) => { if (entry.habitId === 'h1') throw { message: 'habit h1 is not eligible on 2026-10-05' }; });
      const t = setup({ send });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      t.engine.enqueue({ kind: 'complete', habitId: 'h2' });
      await t.engine.flush();
      expect(send).toHaveBeenCalledTimes(2);
      expect(t.engine.getEntries()).toEqual([expect.objectContaining({ habitId: 'h1', status: 'failed', failure: expect.objectContaining({ reason: 'not-on-board' }) })]);
      expect(t.deps.onApplied).toHaveBeenCalledTimes(1);
    });

    it('reports a rejection through the failed hook so the board can refresh to server truth', async () => {
      const onFailed = jest.fn();
      const t = setup({ onFailed, send: jest.fn(async () => { throw { message: 'normal completion date must be the current account date' }; }) });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      await t.engine.flush();
      expect(onFailed).toHaveBeenCalledWith(expect.objectContaining({ habitId: 'h1' }));
    });

    it('treats a unique violation on complete as applied', async () => {
      const t = setup({ send: jest.fn(async () => { throw { code: '23505', message: 'duplicate key' }; }) });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      await t.engine.flush();
      expect(t.engine.getEntries()).toEqual([]);
      expect(t.deps.onApplied).toHaveBeenCalledTimes(1);
    });

    it('pauses on an auth error and retries the same entry on the next flush', async () => {
      let authOk = false;
      const send = jest.fn(async () => { if (!authOk) throw { message: 'JWT expired', code: 'PGRST301' }; });
      const t = setup({ send });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      t.engine.enqueue({ kind: 'complete', habitId: 'h2' });
      await t.engine.flush();
      expect(send).toHaveBeenCalledTimes(1);
      expect(t.engine.getEntries().map(e => e.status)).toEqual(['pending', 'pending']);
      expect(t.engine.getEntries()[0].attempts).toBe(1);
      authOk = true;
      await t.engine.flush();
      expect(t.engine.getEntries()).toEqual([]);
    });

    it('fails an unknown server error at once with its message, so the user can retry it', async () => {
      const t = setup({ send: jest.fn(async () => { throw { message: 'upstream exploded' }; }) });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      await t.engine.flush();
      expect(t.deps.send).toHaveBeenCalledTimes(1);
      expect(t.engine.getEntries()[0]).toEqual(expect.objectContaining({ status: 'failed', failure: expect.objectContaining({ reason: 'server', message: expect.stringContaining('upstream exploded') }) }));
    });
  });

  describe('retry, dismiss, dispose', () => {
    it('retry puts a failed entry back to pending with a fresh attempt count and sends it', async () => {
      const failing = stored({ status: 'failed', attempts: 3, failure: { reason: 'server', message: 'x' } });
      const t = setup({}, [failing]);
      await t.engine.load();
      expect(await t.engine.retry('stored-1')).toBe(true);
      await t.engine.flush();
      expect(t.deps.send).toHaveBeenCalledTimes(1);
      expect(t.engine.getEntries()).toEqual([]);
    });

    it('retry refuses an entry that failed because its day passed, and an unknown id', async () => {
      const t = setup({}, [stored({ status: 'failed', failure: { reason: 'day-passed', message: 'x' } })]);
      await t.engine.load();
      expect(await t.engine.retry('stored-1')).toBe(false);
      expect(await t.engine.retry('nope')).toBe(false);
      expect(t.engine.getEntries()[0].status).toBe('failed');
    });

    it('dismiss removes the entry and persists the removal', async () => {
      const t = setup({}, [stored({ status: 'failed', failure: { reason: 'server', message: 'x' } })]);
      await t.engine.load();
      expect(t.engine.dismiss('stored-1')).toEqual(expect.objectContaining({ id: 'stored-1' }));
      expect(t.engine.getEntries()).toEqual([]);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(t.store.has(KEY)).toBe(false);
      expect(t.engine.dismiss('stored-1')).toBeUndefined();
    });

    it('dispose stops a send that is already past the start of its run, so a signed-out user never sends under the next session', async () => {
      let release: () => void = () => {};
      const store = new Map<string, string>();
      const t = setup({
        storage: {
          getItem: jest.fn(async () => null),
          // The first write is the one that marks the entry as sending; hold it.
          setItem: jest.fn((key: string, value: string) => new Promise<void>(resolve => {
            release = () => { store.set(key, value); resolve(); };
            if (value.includes('"status":"pending"') && !value.includes('sending')) release();
          })),
          removeItem: jest.fn(async () => {}),
        },
      });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      const flushing = t.engine.flush();
      await new Promise(resolve => setTimeout(resolve, 10));
      t.engine.dispose();
      release();
      await flushing;
      expect(t.deps.send).not.toHaveBeenCalled();
    });

    it('dispose stops later flushes', async () => {
      const t = setup();
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      t.engine.dispose();
      await t.engine.flush();
      expect(t.deps.send).not.toHaveBeenCalled();
    });
  });
});

const answer = (accessOverrides: Partial<TrackerAccess> = {}, targets?: (entry: QueueEntry) => TrackerTarget[]): WriteQueueDeps['checkProcessingAccess'] =>
  async entry => ({ access: access(accessOverrides), targets: targets ? targets(entry) : [target(entry.habitId)] });

const heldPurpose = (overrides: Partial<QueueEntry> = {}): QueueEntry => stored({
  status: 'failed', heldForProcessingPause: true, failure: { reason: 'purpose-paused', message: 'x' }, ...overrides,
});

describe('enqueue refusal and the persisted projection', () => {
  it('refuses a known denial and persists nothing, not even the label', async () => {
    const t = setup();
    await t.engine.load();
    expect(t.engine.enqueue({ kind: 'complete', habitId: 'h1', label: 'Secret quest', trackerAccess: access({ canWriteBasic: false }) })).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(t.engine.getEntries()).toEqual([]);
    expect(t.store.get(KEY) ?? '').not.toContain('Secret quest');
    expect(t.deps.storage.setItem).not.toHaveBeenCalledWith(KEY, expect.stringContaining('Secret quest'));
  });

  it('refuses a custom target while custom permission is missing, and accepts it when granted', async () => {
    const t = setup();
    await t.engine.load();
    const custom = [snap('h1', 'custom')];
    expect(t.engine.enqueue({ kind: 'complete', habitId: 'h1', trackerTargets: custom, trackerAccess: access({ canWriteCustom: false }) })).toBe(false);
    expect(t.engine.getEntries()).toEqual([]);
    expect(t.engine.enqueue({ kind: 'complete', habitId: 'h1', trackerTargets: custom,
      trackerAccess: access({ customConsent: true, canWriteCustom: true }) })).toBe(true);
    expect(t.engine.getEntries()).toHaveLength(1);
  });

  it('refuses access that belongs to another account', async () => {
    const t = setup();
    await t.engine.load();
    const foreign = access({ revision: { ...REVISION, userId: 'user-2' } });
    expect(t.engine.enqueue({ kind: 'complete', habitId: 'h1', trackerAccess: foreign })).toBe(false);
    expect(t.engine.getEntries()).toEqual([]);
  });

  it('refuses a request whose snapshots do not name the habit, since its kind is unknown', async () => {
    const t = setup();
    await t.engine.load();
    expect(t.engine.enqueue({ kind: 'complete', habitId: 'h1', trackerTargets: [] })).toBe(false);
    expect(t.engine.enqueue({ kind: 'complete', habitId: 'h1', trackerTargets: [snap('other')] })).toBe(false);
    expect(t.engine.getEntries()).toEqual([]);
  });

  it('returns false and stores nothing while the account zone is unknown', async () => {
    const t = setup({ timeZone: () => null });
    await t.engine.load();
    expect(t.engine.enqueue({ kind: 'complete', habitId: 'h1' })).toBe(false);
    expect(t.engine.getEntries()).toEqual([]);
  });

  it('stores only the revision and target projection, never the capability', async () => {
    const t = setup();
    await t.engine.load();
    const richAccess = { ...access({ customConsent: true, canWriteCustom: true }), extra: 'x' } as TrackerAccess;
    const richTargets = [{ ...snap('h1'), canWrite: true } as ReturnType<typeof snap>];
    expect(t.engine.enqueue({ kind: 'complete', habitId: 'h1', trackerAccess: richAccess, trackerTargets: richTargets })).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    const raw = t.store.get(KEY) ?? '';
    expect(raw).not.toContain('canWrite');
    expect(raw).not.toContain('customConsent');
    expect(raw).not.toContain('"extra"');
    expect(t.persisted()[0].trackerRevision).toEqual(REVISION);
    expect(t.persisted()[0].trackerTargets).toEqual([snap('h1')]);
  });

  it('detaches the stored revision from the caller object', async () => {
    const t = setup({ isOnline: () => false });
    await t.engine.load();
    const mine = access({ revision: { ...REVISION } });
    t.engine.enqueue({ kind: 'complete', habitId: 'h1', trackerAccess: mine });
    mine.revision.consentVersion = 99;
    expect(t.engine.getEntries()[0].trackerRevision?.consentVersion).toBe(1);
  });
});

describe('flush and tracker permission', () => {
  it('sends a still-basic entry with its captured revision across an unrelated optional-revision change', async () => {
    const newer = { ...REVISION, consentVersion: 7, authorityVersion: 4 };
    const t = setup({ checkProcessingAccess: answer({ revision: newer }) });
    await t.engine.load();
    t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
    await t.engine.flush();
    expect(t.deps.send).toHaveBeenCalledWith(expect.objectContaining({ trackerRevision: REVISION, trackerTargets: [snap('h1')] }));
    expect(t.engine.getEntries()).toEqual([]);
  });

  it('holds only the entry whose target became custom and carries on with the rest', async () => {
    const t = setup({ checkProcessingAccess: answer({}, entry => [target(entry.habitId, { inputKind: entry.habitId === 'h1' ? 'custom' : 'basic' })]) },
      [stored(), stored({ id: 'second', habitId: 'h2' })]);
    await t.engine.load(); await t.engine.flush();
    expect(t.calls).toEqual(['complete:h2']);
    expect(t.engine.getEntries()).toEqual([expect.objectContaining({ id: 'stored-1', status: 'failed', heldForProcessingPause: true,
      failure: expect.objectContaining({ reason: 'purpose-paused' }) })]);
  });

  it.each([
    ['missing', () => [] as TrackerTarget[]],
    ['no longer writable', () => [target('h1', { canWrite: false })]],
  ])('holds an entry whose current target is %s', async (_name, targets) => {
    const t = setup({ checkProcessingAccess: answer({}, targets) }, [stored()]);
    await t.engine.load(); await t.engine.flush();
    expect(t.deps.send).not.toHaveBeenCalled();
    expect(t.engine.getEntries()[0]).toEqual(expect.objectContaining({ status: 'failed', heldForProcessingPause: true }));
    expect(t.engine.getEntries()[0].heldForTrackerPause).toBeUndefined();
  });

  it('holds a captured custom entry when custom permission is gone', async () => {
    const t = setup({ checkProcessingAccess: answer({ canWriteCustom: false }, () => [target('h1', { inputKind: 'custom', canWrite: true })]) },
      [stored({ trackerTargets: [snap('h1', 'custom')] })]);
    await t.engine.load(); await t.engine.flush();
    expect(t.deps.send).not.toHaveBeenCalled();
    expect(t.engine.getEntries()[0].failure?.reason).toBe('purpose-paused');
  });

  it('holds an entry with no captured revision or targets and never stamps it', async () => {
    const legacy = stored(); delete legacy.trackerRevision;
    const noTargets = stored({ id: 'second', habitId: 'h2' }); delete noTargets.trackerTargets;
    const t = setup({}, [legacy, noTargets]);
    await t.engine.load(); await t.engine.flush();
    expect(t.deps.send).not.toHaveBeenCalled();
    expect(t.engine.getEntries().map(e => [e.failure?.reason, e.heldForProcessingPause])).toEqual([['purpose-paused', true], ['purpose-paused', true]]);
    expect(t.engine.getEntries()[0].trackerRevision).toBeUndefined();
    expect(t.engine.getEntries()[1].trackerTargets).toBeUndefined();
  });

  it('holds an entry whose stored revision belonged to another account', async () => {
    const raw = JSON.parse(encodeQueue([stored()]));
    raw.entries[0].trackerRevision = { ...REVISION, userId: 'user-2' };
    const t = setup({ storage: { getItem: async () => JSON.stringify(raw), setItem: async () => {}, removeItem: async () => {} } });
    await t.engine.load(); await t.engine.flush();
    expect(t.deps.send).not.toHaveBeenCalled();
    expect(t.engine.getEntries()[0]).toEqual(expect.objectContaining({ status: 'failed', heldForProcessingPause: true }));
    expect(t.engine.getEntries()[0].trackerRevision).toBeUndefined();
  });

  it('never adopts access that belongs to another account', async () => {
    const t = setup({ checkProcessingAccess: answer({ revision: { ...REVISION, userId: 'user-2' } }) }, [stored()]);
    await t.engine.load(); await t.engine.flush();
    expect(t.deps.send).not.toHaveBeenCalled();
    expect(t.engine.getEntries()).toEqual([stored()]);
  });

  it('holds a single entry when the server answers ET003, and the others still go', async () => {
    const send = jest.fn(async (entry: QueueEntry) => { if (entry.habitId === 'h1') throw { code: 'ET003', message: 'stale' }; });
    const t = setup({ send }, [stored(), stored({ id: 'second', habitId: 'h2' })]);
    await t.engine.load(); await t.engine.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(t.engine.getEntries()).toEqual([expect.objectContaining({ id: 'stored-1', status: 'failed', heldForProcessingPause: true,
      failure: expect.objectContaining({ reason: 'purpose-paused' }) })]);
    expect(t.engine.getEntries()[0].trackerRevision).toEqual(REVISION);
  });

  it('holds on ET002 the same way', async () => {
    const t = setup({ send: jest.fn(async () => { throw { code: 'ET002', message: 'no purpose' }; }) }, [stored()]);
    await t.engine.load(); await t.engine.flush();
    expect(t.engine.getEntries()[0]).toEqual(expect.objectContaining({ heldForProcessingPause: true, failure: expect.objectContaining({ reason: 'purpose-paused' }) }));
  });

  it('reports a purpose hold through the failed hook', async () => {
    const onFailed = jest.fn();
    const t = setup({ onFailed, checkProcessingAccess: answer({}, () => []) }, [stored()]);
    await t.engine.load(); await t.engine.flush();
    expect(onFailed).toHaveBeenCalledWith(expect.objectContaining({ id: 'stored-1', heldForProcessingPause: true }));
  });

  it('does not drain a held entry after permission returns, and never renews its revision', async () => {
    const newer = { ...REVISION, consentVersion: 9 };
    const t = setup({ checkProcessingAccess: answer({ revision: newer }) }, [heldPurpose()]);
    await t.engine.load(); await t.engine.flush(); await t.engine.flush();
    expect(t.deps.send).not.toHaveBeenCalled();
    expect(t.engine.getEntries()[0]).toEqual({ ...heldPurpose(), heldAt: DAY1.getTime() });
  });

  it('keeps a purpose hold across a restart without replaying it', async () => {
    const first = setup({ checkProcessingAccess: answer({}, () => []) }, [stored()]);
    await first.engine.load(); await first.engine.flush(); await new Promise(resolve => setTimeout(resolve, 0));
    const restarted = setup({}, first.persisted());
    await restarted.engine.load(); await restarted.engine.flush();
    expect(restarted.deps.send).not.toHaveBeenCalled();
    expect(restarted.engine.getEntries()[0]).toEqual(expect.objectContaining({ status: 'failed', heldForProcessingPause: true, trackerRevision: REVISION }));
  });

  it('lets a later action for the same habit wait behind a held one, while other habits go on', async () => {
    const t = setup({}, [heldPurpose(), stored({ id: 'later', createdAt: 2 }), stored({ id: 'other', habitId: 'h2', createdAt: 3 })]);
    await t.engine.load(); await t.engine.flush();
    expect(t.calls).toEqual(['complete:h2']);
    expect(t.engine.getEntries().map(e => [e.id, e.status])).toEqual([['stored-1', 'failed'], ['later', 'pending']]);
  });

  it('does not let a held entry that only expired block the same habit today', async () => {
    const expired = heldPurpose({ accountDate: '2026-10-04', failure: { reason: 'day-passed', message: 'x' } });
    const t = setup({}, [expired, stored({ id: 'later', createdAt: 2 })]);
    await t.engine.load(); await t.engine.flush();
    expect(t.calls).toEqual(['complete:h1']);
  });

  it('shows a completion refused with 22023 as not saved, instead of quietly losing it', async () => {
    const t = setup({ send: jest.fn(async () => { throw { code: '22023', message: 'Invalid tracker input.' }; }) });
    await t.engine.load();
    t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
    await t.engine.flush();
    expect(t.engine.getEntries()).toEqual([expect.objectContaining({ status: 'failed' })]);
    expect(t.deps.onApplied).not.toHaveBeenCalled();
    expect(t.deps.send).toHaveBeenCalledTimes(1);
  });

  it('reconciles an uncertain progress entry before another delta for the same habit goes out', async () => {
    const order: string[] = [];
    const t = setup({
      readQuest: jest.fn(async () => { order.push('read'); return quest({ targetCount: 5, progressCount: 1 }); }),
      send: jest.fn(async (entry: QueueEntry) => { order.push(`send:${entry.delta}`); }),
    }, [stored({ kind: 'progress', delta: 1, base: 0, status: 'uncertain' }), stored({ id: 'next', kind: 'progress', delta: 1, base: 1, createdAt: 2 })]);
    await t.engine.load(); await t.engine.flush();
    expect(order).toEqual(['read', 'send:1']);
    expect(t.deps.onApplied).toHaveBeenCalledTimes(2);
  });

  it('sends nothing for the habit while the reconciling read is unavailable', async () => {
    const t = setup({ readQuest: jest.fn(async () => { throw network(); }) },
      [stored({ kind: 'progress', delta: 1, base: 0, status: 'uncertain' }), stored({ id: 'next', kind: 'progress', delta: 1, base: 1, createdAt: 2 })]);
    await t.engine.load(); await t.engine.flush();
    expect(t.deps.send).not.toHaveBeenCalled();
    expect(t.engine.getEntries().map(e => e.status)).toEqual(['uncertain', 'pending']);
  });
});

describe('Retry of a held entry', () => {
  it('renews the revision and targets for an unchanged basic target, then reconciles before sending', async () => {
    const newer = { ...REVISION, consentVersion: 5 };
    const order: string[] = [];
    const t = setup({
      checkProcessingAccess: answer({ revision: newer }),
      readQuest: jest.fn(async () => { order.push('read'); return quest(); }),
      send: jest.fn(async () => { order.push('send'); }),
    }, [heldPurpose()]);
    await t.engine.load();
    expect(await t.engine.retry('stored-1')).toBe(true);
    expect(t.engine.getEntries()[0]).toEqual(expect.objectContaining({ status: 'uncertain', attempts: 0, trackerRevision: newer, trackerTargets: [snap('h1')] }));
    expect(t.engine.getEntries()[0].failure).toBeUndefined();
    expect(t.engine.getEntries()[0].heldForProcessingPause).toBe(true);
    await t.engine.flush();
    expect(order).toEqual(['read', 'send']);
    expect(t.deps.send).toHaveBeenCalledWith(expect.objectContaining({ trackerRevision: newer }));
  });

  it('refuses when the target became custom, leaving the entry exactly as it was', async () => {
    const t = setup({ checkProcessingAccess: answer({ revision: { ...REVISION, consentVersion: 5 } }, () => [target('h1', { inputKind: 'custom' })]) }, [heldPurpose()]);
    await t.engine.load();
    expect(await t.engine.retry('stored-1')).toBe(false);
    expect(t.engine.getEntries()[0]).toEqual({ ...heldPurpose(), heldAt: DAY1.getTime() });
  });

  it.each([
    ['access cannot be established', async () => { throw network(); }],
    ['basic writes are paused', answer({ canWriteBasic: false })],
    ['the access belongs to another account', answer({ revision: { ...REVISION, userId: 'user-2' } })],
    ['the target is gone', answer({}, () => [])],
    ['the target cannot be written', answer({}, () => [target('h1', { canWrite: false })])],
  ] as [string, WriteQueueDeps['checkProcessingAccess']][])('refuses when %s', async (_name, check) => {
    const t = setup({ checkProcessingAccess: check }, [heldPurpose()]);
    await t.engine.load();
    expect(await t.engine.retry('stored-1')).toBe(false);
    expect(t.engine.getEntries()[0]).toEqual({ ...heldPurpose(), heldAt: DAY1.getTime() });
  });

  it('refuses after the original account day', async () => {
    const t = setup({}, [heldPurpose()]);
    await t.engine.load();
    t.setClock(DAY2);
    expect(await t.engine.retry('stored-1')).toBe(false);
    expect(t.engine.getEntries()[0].status).toBe('failed');
    expect(t.deps.send).not.toHaveBeenCalled();
  });

  it('does not resurrect an entry that was dismissed or whose day ended while the check was pending', async () => {
    let release: () => void = () => {};
    const gateOpen = new Promise<void>(resolve => { release = resolve; });
    const t = setup({ checkProcessingAccess: async entry => { await gateOpen; return { access: access(), targets: [target(entry.habitId)] }; } },
      [heldPurpose(), heldPurpose({ id: 'second', habitId: 'h2' })]);
    await t.engine.load();
    const gone = t.engine.retry('stored-1');
    const late = t.engine.retry('second');
    t.engine.dismiss('stored-1'); t.setClock(DAY2);
    release();
    expect(await gone).toBe(false);
    expect(await late).toBe(false);
    expect(t.engine.getEntries().map(e => e.status)).toEqual(['failed']);
  });

  it('renews an entry that never captured targets only when the fresh target is basic', async () => {
    const bare = heldPurpose(); delete bare.trackerTargets; delete bare.trackerRevision;
    const ok = setup({}, [bare]);
    await ok.engine.load();
    expect(await ok.engine.retry('stored-1')).toBe(true);
    expect(ok.engine.getEntries()[0]).toEqual(expect.objectContaining({ trackerRevision: REVISION, trackerTargets: [snap('h1')] }));
    const custom = setup({ checkProcessingAccess: answer({}, () => [target('h1', { inputKind: 'custom' })]) }, [bare]);
    await custom.engine.load();
    expect(await custom.engine.retry('stored-1')).toBe(false);
    expect(custom.engine.getEntries()[0].trackerRevision).toBeUndefined();
  });

  it('renews a held custom entry while custom permission is current', async () => {
    const entry = heldPurpose({ trackerTargets: [snap('h1', 'custom')] });
    const t = setup({ checkProcessingAccess: answer({ customConsent: true, canWriteCustom: true }, () => [target('h1', { inputKind: 'custom' })]) }, [entry]);
    await t.engine.load();
    expect(await t.engine.retry('stored-1')).toBe(true);
    const denied = setup({ checkProcessingAccess: answer({ canWriteCustom: false }, () => [target('h1', { inputKind: 'custom' })]) }, [entry]);
    await denied.engine.load();
    expect(await denied.engine.retry('stored-1')).toBe(false);
  });

  it('keeps a retried age-held entry on its original day', async () => {
    const t = setup({}, [stored({ status: 'failed', heldForTrackerPause: true, failure: { reason: 'tracker-paused', message: 'x' } })]);
    await t.engine.load();
    expect(await t.engine.retry('stored-1')).toBe(true);
    expect(t.engine.getEntries()[0]).toEqual(expect.objectContaining({ heldForTrackerPause: true, accountDate: '2026-10-05', status: 'uncertain' }));
  });
});

describe('held entries expire after 30 days', () => {
  const MS = 30 * 24 * 60 * 60 * 1000;
  const T = DAY1.getTime();
  const at = (ms: number) => new Date(ms);
  const heldAt = (overrides: Partial<QueueEntry> = {}) => heldPurpose({ heldAt: T, label: 'Secret quest', ...overrides });

  it('removes a held entry older than 30 days on load, reports it, and keeps no label anywhere', async () => {
    const onFailed = jest.fn();
    const t = setup({ onFailed, now: () => at(T + MS + 1) }, [heldAt()]);
    await t.engine.load(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(t.engine.getEntries()).toEqual([]);
    expect(onFailed).toHaveBeenCalledTimes(1);
    const reported = onFailed.mock.calls[0][0] as QueueEntry;
    expect(reported).toEqual(expect.objectContaining({ id: 'stored-1', failure: expect.objectContaining({ reason: 'hold-expired' }) }));
    expect(JSON.stringify(reported)).not.toContain('Secret quest');
    expect(t.store.get(KEY) ?? '').not.toContain('Secret quest');
    expect(t.deps.send).not.toHaveBeenCalled();
  });

  it('keeps it at 30 days minus 1 ms and exactly 30 days, and removes it at plus 1 ms on the next sweep', async () => {
    const onFailed = jest.fn();
    const t = setup({ onFailed }, [heldAt()]);
    await t.engine.load();
    t.setClock(at(T + MS - 1)); t.engine.sweep();
    expect(t.engine.getEntries()).toHaveLength(1);
    t.setClock(at(T + MS)); t.engine.sweep();
    expect(t.engine.getEntries()).toHaveLength(1);
    expect(onFailed).not.toHaveBeenCalled();
    t.setClock(at(T + MS + 1)); t.engine.sweep();
    expect(t.engine.getEntries()).toEqual([]);
    expect(onFailed).toHaveBeenCalledWith(expect.objectContaining({ failure: expect.objectContaining({ reason: 'hold-expired' }) }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(t.store.has(KEY)).toBe(false);
  });

  it('expires held entries on a flush even while the account zone is unknown', async () => {
    let zone: string | null = 'UTC';
    const t = setup({ timeZone: () => zone }, [heldAt()]);
    await t.engine.load();
    zone = null; t.setClock(at(T + MS + 1)); t.engine.sweep();
    expect(t.engine.getEntries()).toEqual([]);
  });

  it('gives an old held entry with no stamp its 30 days from the load, never expiring it at once', async () => {
    const loadedAt = T + 90 * 24 * 60 * 60 * 1000;
    const t = setup({ now: () => at(loadedAt) }, [heldPurpose()]);
    await t.engine.load(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(t.engine.getEntries()).toHaveLength(1);
    expect(t.engine.getEntries()[0].heldAt).toBe(loadedAt);
    expect(t.persisted()[0].heldAt).toBe(loadedAt);
  });

  it('stamps an entry when it is first held, and not again when it is held a second time', async () => {
    const t = setup({ checkProcessingAccess: answer({}, () => []) });
    await t.engine.load(); t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
    await t.engine.flush();
    expect(t.engine.getEntries()[0]).toEqual(expect.objectContaining({ heldForProcessingPause: true, heldAt: T }));
    t.setClock(at(T + 1000));
    await t.engine.flush();
    expect(t.engine.getEntries()[0].heldAt).toBe(T);
  });

  it('stamps entries held for a tracker pause too', async () => {
    const t = setup({ checkProcessingAccess: gate(() => false) });
    await t.engine.load(); t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
    await t.engine.flush();
    expect(t.engine.getEntries()[0]).toEqual(expect.objectContaining({ heldForTrackerPause: true, heldAt: T }));
  });

  it('leaves ordinary failed entries alone however old they are', async () => {
    const failed = stored({ status: 'failed', failure: { reason: 'server', message: 'x' }, createdAt: 1 });
    const t = setup({ now: () => at(T + 5 * MS) }, [failed]);
    await t.engine.load();
    expect(t.engine.getEntries().map(e => e.id)).toEqual(['stored-1']);
  });

  it('does not expire a hold released by Retry before day 30', async () => {
    const t = setup({ checkProcessingAccess: answer() }, [heldAt()]);
    await t.engine.load();
    t.setClock(at(T + 1000));
    expect(await t.engine.retry('stored-1')).toBe(true);
    t.setClock(at(T + MS + 1)); t.engine.sweep();
    expect(t.engine.getEntries().map(e => e.id)).toContain('stored-1');
  });

  it('refuses Retry for an expired hold that has not been swept yet, and removes it', async () => {
    const t = setup({ checkProcessingAccess: answer() }, [heldAt()]);
    await t.engine.load();
    t.setClock(at(T + MS + 1));
    expect(await t.engine.retry('stored-1')).toBe(false);
    expect(t.engine.getEntries()).toEqual([]);
  });

  it('does not expire or adopt another account\'s entries across A to B to A', async () => {
    const storeA = encodeQueue([heldAt()]);
    const shared = new Map<string, string>([[KEY, storeA]]);
    const storage = (userNow: number) => ({
      getItem: async (key: string) => shared.get(key) ?? null,
      setItem: async (key: string, value: string) => { shared.set(key, value); },
      removeItem: async (key: string) => { shared.delete(key); },
      now: userNow,
    });
    const engineFor = (userId: string, nowMs: number, onFailed = jest.fn()) => {
      const { getItem, setItem, removeItem } = storage(nowMs);
      return { onFailed, engine: createWriteQueueEngine({
        userId, storage: { getItem, setItem, removeItem }, now: () => at(nowMs), timeZone: () => 'UTC', isOnline: () => false,
        checkProcessingAccess: gate(() => true), newId: () => 'x', send: jest.fn(), readQuest: jest.fn(), onApplied: jest.fn(), onFailed,
      }) };
    };
    const a1 = engineFor('user-1', T + 1000); await a1.engine.load(); a1.engine.dispose();
    const b = engineFor('user-2', T + MS + 1); await b.engine.load(); b.engine.sweep(); b.engine.dispose();
    expect(b.engine.getEntries()).toEqual([]);
    expect(b.onFailed).not.toHaveBeenCalled();
    expect(decodeQueue(shared.get(KEY), 'user-1').map(e => e.id)).toEqual(['stored-1']);
    const a2 = engineFor('user-1', T + 2000); await a2.engine.load();
    expect(a2.engine.getEntries().map(e => e.id)).toEqual(['stored-1']);
    expect(a2.onFailed).not.toHaveBeenCalled();
  });
});

describe('a held copy that expires around an account switch', () => {
  const T = Date.parse('2026-10-05T12:00:00Z');
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const held: QueueEntry = {
    id: 'held-1', userId: 'user-1', kind: 'complete', habitId: 'h1', accountDate: '2026-10-05', createdAt: T, attempts: 0, status: 'failed',
    heldForTrackerPause: true, heldAt: T, failure: { reason: 'tracker-paused', message: 'held' },
  };
  async function open() {
    let now = T;
    const onFailed = jest.fn();
    const saved = new Map<string, string>([[writeQueueKey('user-1'), encodeQueue([held])]]);
    const engine = createWriteQueueEngine({
      userId: 'user-1',
      storage: {
        getItem: async key => saved.get(key) ?? null,
        setItem: async (key, value) => { saved.set(key, value); },
        removeItem: async key => { saved.delete(key); },
      },
      now: () => new Date(now), timeZone: () => 'UTC', isOnline: () => false,
      checkProcessingAccess: jest.fn(), newId: () => 'x', send: jest.fn(), readQuest: jest.fn(), onApplied: jest.fn(), onFailed,
    });
    await engine.load();
    return { engine, onFailed, saved, pass: () => { now = T + THIRTY_DAYS + 1; } };
  }
  it('gives its notice while the queue is open', async () => {
    const t = await open();
    t.pass();
    t.engine.sweep();
    expect(t.onFailed).toHaveBeenCalledTimes(1);
    expect(t.engine.getEntries()).toEqual([]);
  });
  it('gives no notice and changes nothing after the queue has closed, so it cannot reach the next account', async () => {
    const t = await open();
    t.engine.dispose();
    t.pass();
    t.engine.sweep();
    expect(t.onFailed).not.toHaveBeenCalled();
    expect(decodeQueue(t.saved.get(writeQueueKey('user-1')), 'user-1').map(e => e.id)).toEqual(['held-1']);
  });
});
