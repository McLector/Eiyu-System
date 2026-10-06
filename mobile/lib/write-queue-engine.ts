import { accountDateKey } from '@eiyu/shared';
import type { Quest } from '@eiyu/shared';
import {
  FAILURE_MESSAGES,
  classifyError,
  decodeQueue,
  encodeQueue,
  enqueue as enqueueEntry,
  expireEntries,
  isExpired,
  resolveUncertain,
  reviveEntries,
  type FailureReason,
  type QueueEntry,
  type QueueKind,
} from './write-queue';

/**
 * Persists the offline write queue and drains it. Framework-free: the React side only supplies the dependencies below
 * and the triggers (reconnect, foreground, midnight, manual retry) that call `flush`.
 *
 * Every write goes through here, online or not, so there is one path to reason about. Offline writes stay pending and
 * are never sent; a request that fails in flight is "uncertain" and re-reads the server before it is resent.
 */

export interface WriteQueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface WriteQueueDeps {
  userId: string;
  storage: WriteQueueStorage;
  now: () => Date;
  timeZone: () => string;
  /** null = unknown, which is treated as "try". */
  isOnline: () => boolean | null;
  newId: () => string;
  /** Performs the RPC for one entry. Throws on any failure. */
  send: (entry: QueueEntry) => Promise<void>;
  /** A fresh server read of one habit, for resolving an uncertain entry. */
  readQuest: (habitId: string) => Promise<Quest | undefined>;
  /** The write landed. Awaited before the entry leaves the queue so the board never flickers back. */
  onApplied: (entry: QueueEntry) => Promise<void> | void;
  /** The server refused the write (not a network or auth problem). */
  onFailed?: (entry: QueueEntry) => void;
}

export interface EnqueueRequest {
  kind: QueueKind;
  habitId: string;
  delta?: number;
  /** Progress only: the count shown when the user tapped. */
  base?: number;
}

export interface WriteQueueEngine {
  load(): Promise<void>;
  getEntries(): QueueEntry[];
  subscribe(listener: (entries: QueueEntry[]) => void): () => void;
  enqueue(request: EnqueueRequest): void;
  flush(): Promise<void>;
  /** Expires entries from an earlier account day (the midnight tick). */
  sweep(): void;
  retry(id: string): boolean;
  dismiss(id: string): QueueEntry | undefined;
  dispose(): void;
}

export const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [30_000, 120_000];

export const writeQueueKey = (userId: string) => `eiyu.writeQueue.v1.${userId}`;

export function createWriteQueueEngine(deps: WriteQueueDeps): WriteQueueEngine {
  const key = writeQueueKey(deps.userId);
  const listeners = new Set<(entries: QueueEntry[]) => void>();
  const notBefore = new Map<string, number>();
  let entries: QueueEntry[] = [];
  let persistChain: Promise<unknown> = Promise.resolve();
  let loading: Promise<void> | null = null;
  let running: Promise<void> | null = null;
  let rerun = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const emit = () => listeners.forEach(listener => listener(entries));

  const persist = (): Promise<unknown> => {
    const snapshot = entries;
    persistChain = persistChain
      .then(() => (snapshot.length > 0 ? deps.storage.setItem(key, encodeQueue(snapshot)) : deps.storage.removeItem(key)))
      .catch(() => {});
    return persistChain;
  };

  const commit = (next: QueueEntry[]) => {
    entries = next;
    void persist();
    emit();
  };

  const patch = (id: string, change: Partial<QueueEntry>) => {
    if (!entries.some(entry => entry.id === id)) return;
    commit(entries.map(entry => (entry.id === id ? { ...entry, ...change } : entry)));
  };

  const remove = (id: string) => commit(entries.filter(entry => entry.id !== id));

  const fail = (entry: QueueEntry, reason: FailureReason, message: string = FAILURE_MESSAGES[reason]) => {
    patch(entry.id, { status: 'failed', failure: { reason, message } });
    deps.onFailed?.({ ...entry, status: 'failed', failure: { reason, message } });
  };

  const applied = async (entry: QueueEntry) => {
    try {
      await deps.onApplied(entry);
    } catch {
      // The write landed; a failed refresh must not keep it in the queue.
    }
    remove(entry.id);
  };

  /** Oldest entry that may be tried now. An entry waiting out a backoff also holds back later ones for the same habit. */
  const nextEligible = (): QueueEntry | undefined => {
    const blocked = new Set<string>();
    const clock = Date.now();
    for (const entry of entries) {
      if (entry.status !== 'pending' && entry.status !== 'uncertain') continue;
      if (blocked.has(entry.habitId)) continue;
      if ((notBefore.get(entry.id) ?? 0) > clock) {
        blocked.add(entry.habitId);
        continue;
      }
      return entry;
    }
    return undefined;
  };

  /** Returns false when the run should stop (offline or auth), true to carry on with the next entry. */
  const process = async (entry: QueueEntry): Promise<boolean> => {
    if (entry.status === 'uncertain') {
      let quest: Quest | undefined;
      try {
        quest = await deps.readQuest(entry.habitId);
      } catch {
        return false;
      }
      const resolution = resolveUncertain(entry, quest);
      if (resolution.action === 'drop') {
        await applied(entry);
        return true;
      }
      if (resolution.action === 'fail') {
        fail(entry, resolution.reason);
        return true;
      }
    }

    const attempts = entry.attempts + 1;
    patch(entry.id, { status: 'sending', attempts });
    await persist();
    const sending: QueueEntry = { ...entry, status: 'sending', attempts };
    try {
      await deps.send(sending);
    } catch (error) {
      const outcome = classifyError(entry.kind, error);
      switch (outcome.type) {
        case 'network':
          patch(entry.id, { status: 'uncertain' });
          return false;
        case 'auth':
          patch(entry.id, { status: 'pending', attempts: entry.attempts });
          return false;
        case 'applied':
          await applied(sending);
          return true;
        case 'failed':
          fail(sending, outcome.reason, outcome.message);
          return true;
        case 'retry':
          if (attempts >= MAX_ATTEMPTS) {
            fail(sending, 'server', `${FAILURE_MESSAGES.server} (${outcome.message})`);
          } else {
            notBefore.set(entry.id, Date.now() + BACKOFF_MS[attempts - 1]);
            patch(entry.id, { status: 'pending' });
          }
          return true;
      }
    }
    await applied(sending);
    return true;
  };

  const scheduleRetry = () => {
    clearTimeout(timer);
    if (disposed) return;
    const waiting = entries.filter(entry => (entry.status === 'pending' || entry.status === 'uncertain') && notBefore.has(entry.id));
    if (waiting.length === 0) return;
    const earliest = Math.min(...waiting.map(entry => notBefore.get(entry.id) as number));
    timer = setTimeout(() => void flush(), Math.max(0, earliest - Date.now()) + 1);
  };

  const pass = async () => {
    for (;;) {
      if (disposed) return;
      sweep();
      if (deps.isOnline() === false) return;
      const entry = nextEligible();
      if (!entry) return;
      if (!(await process(entry))) return;
    }
  };

  const run = async () => {
    if (loading) await loading;
    do {
      rerun = false;
      await pass();
    } while (rerun && !disposed);
    scheduleRetry();
  };

  function flush(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (running) {
      rerun = true;
      return running;
    }
    running = run().finally(() => { running = null; });
    return running;
  }

  function sweep() {
    const next = expireEntries(entries, deps.now(), deps.timeZone());
    if (next !== entries) commit(next);
  }

  return {
    load() {
      loading = (async () => {
        let raw: string | null = null;
        try {
          raw = await deps.storage.getItem(key);
        } catch {
          raw = null;
        }
        const revived = reviveEntries(decodeQueue(raw, deps.userId), deps.now(), deps.timeZone());
        entries = [...revived, ...entries];
        if (raw !== null) void persist();
        emit();
      })();
      return loading;
    },
    getEntries: () => entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    enqueue(request) {
      commit(enqueueEntry(entries, {
        id: deps.newId(),
        userId: deps.userId,
        kind: request.kind,
        habitId: request.habitId,
        accountDate: accountDateKey(deps.now(), deps.timeZone()),
        delta: request.delta,
        base: request.base,
        now: deps.now().getTime(),
      }));
    },
    flush,
    sweep,
    retry(id) {
      const entry = entries.find(candidate => candidate.id === id);
      if (!entry || entry.status !== 'failed' || entry.failure?.reason === 'day-passed') return false;
      if (isExpired(entry, deps.now(), deps.timeZone())) return false;
      notBefore.delete(id);
      patch(id, { status: 'pending', attempts: 0, failure: undefined });
      return true;
    },
    dismiss(id) {
      const entry = entries.find(candidate => candidate.id === id);
      if (entry) remove(id);
      return entry;
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      listeners.clear();
    },
  };
}
