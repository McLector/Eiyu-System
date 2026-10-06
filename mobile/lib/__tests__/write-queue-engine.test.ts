import type { Quest } from '@eiyu/shared';
import { createWriteQueueEngine, type WriteQueueDeps } from '../write-queue-engine';
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

function stored(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'stored-1', userId: 'user-1', kind: 'complete', habitId: 'h1', accountDate: '2026-10-05',
    createdAt: 1, attempts: 0, status: 'pending', ...overrides,
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
    ...overrides,
  };
  const engine = createWriteQueueEngine(deps);
  return {
    engine, deps, store, calls, snapshotsAtSend,
    setClock: (d: Date) => { clock = d; },
    maxInFlight: () => maxInFlight,
    persisted: () => decodeQueue(store.get(KEY), 'user-1'),
  };
}

const network = () => Object.assign(new Error('Network request failed'), {});

describe('write queue engine', () => {
  afterEach(() => { jest.useRealTimers(); });

  describe('enqueue and persistence', () => {
    it('stores a new entry under the per-user key before anything is sent', async () => {
      const t = setup();
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      await Promise.resolve();
      await Promise.resolve();
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

  describe('flush', () => {
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
      authOk = true;
      await t.engine.flush();
      expect(t.engine.getEntries()).toEqual([]);
    });

    it('backs off an unknown server error, retries it, and fails it after three attempts', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(DAY1);
      const t = setup({ send: jest.fn(async () => { throw { message: 'upstream exploded' }; }) });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      await t.engine.flush();
      expect(t.deps.send).toHaveBeenCalledTimes(1);
      expect(t.engine.getEntries()[0].status).toBe('pending');
      await t.engine.flush();
      expect(t.deps.send).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(31_000);
      expect(t.deps.send).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(121_000);
      expect(t.deps.send).toHaveBeenCalledTimes(3);
      expect(t.engine.getEntries()[0]).toEqual(expect.objectContaining({ status: 'failed', failure: expect.objectContaining({ reason: 'server', message: expect.stringContaining('upstream exploded') }) }));
    });
  });

  describe('retry, dismiss, dispose', () => {
    it('retry puts a failed entry back to pending with a fresh attempt count and sends it', async () => {
      const failing = stored({ status: 'failed', attempts: 3, failure: { reason: 'server', message: 'x' } });
      const t = setup({}, [failing]);
      await t.engine.load();
      expect(t.engine.retry('stored-1')).toBe(true);
      await t.engine.flush();
      expect(t.deps.send).toHaveBeenCalledTimes(1);
      expect(t.engine.getEntries()).toEqual([]);
    });

    it('retry refuses an entry that failed because its day passed, and an unknown id', async () => {
      const t = setup({}, [stored({ status: 'failed', failure: { reason: 'day-passed', message: 'x' } })]);
      await t.engine.load();
      expect(t.engine.retry('stored-1')).toBe(false);
      expect(t.engine.retry('nope')).toBe(false);
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

    it('dispose stops pending retries and later flushes', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(DAY1);
      const t = setup({ send: jest.fn(async () => { throw { message: 'upstream exploded' }; }) });
      await t.engine.load();
      t.engine.enqueue({ kind: 'complete', habitId: 'h1' });
      await t.engine.flush();
      t.engine.dispose();
      await jest.advanceTimersByTimeAsync(300_000);
      await t.engine.flush();
      expect(t.deps.send).toHaveBeenCalledTimes(1);
    });
  });
});
