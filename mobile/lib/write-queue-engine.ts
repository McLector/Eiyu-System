import { accountDateKey } from '@eiyu/shared';
import type { Quest, TrackerAccess, TrackerRevision, TrackerTarget, TrackerTargetSnapshot } from '@eiyu/shared';
import {
  FAILURE_MESSAGES,
  HELD_ACTION_DAY_ENDED_MESSAGE,
  classifyError,
  decodeQueue,
  encodeQueue,
  enqueue as enqueueEntry,
  expireEntries,
  expireHeldEntries,
  isExpired,
  isHeld,
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
  /** The account's IANA zone, or null until it is known (the profile may still be loading). */
  timeZone: () => string | null;
  /** null = unknown, which is treated as "try". */
  isOnline: () => boolean | null;
  /**
   * Fresh owner-bound read of the account's tracker permission and of the entry's habit. Throws when permission
   * cannot be established; a habit that no longer exists is reported by leaving it out of `targets`.
   */
  checkProcessingAccess: (entry: QueueEntry) => Promise<{ access: TrackerAccess; targets: TrackerTarget[] }>;
  newId: () => string;
  /** Performs the RPC for one entry and returns what it answered (the progress count). Throws on any failure. */
  send: (entry: QueueEntry) => Promise<unknown>;
  /** A fresh server read of one habit, for resolving an uncertain entry. */
  readQuest: (habitId: string) => Promise<Quest | undefined>;
  /** The write landed. Awaited before the entry leaves the queue so the board never flickers back. */
  onApplied: (entry: QueueEntry, result?: unknown) => Promise<void> | void;
  /** The server refused the write (not a network or auth problem). */
  onFailed?: (entry: QueueEntry) => void;
}

export interface EnqueueRequest {
  kind: QueueKind;
  habitId: string;
  delta?: number;
  /** Progress only: the count shown when the user tapped. */
  base?: number;
  label?: string;
  /** What the user was allowed to do when acting. Only its revision is stored. */
  trackerAccess: QueueWriteAccess;
  /** The input kind of the habit as the user saw it. */
  trackerTargets: TrackerTargetSnapshot[];
}

export interface WriteQueueEngine {
  load(): Promise<void>;
  getEntries(): QueueEntry[];
  subscribe(listener: (entries: QueueEntry[]) => void): () => void;
  /** true = accepted and persisted; false = refused (a known denial or an unusable request): nothing is stored. */
  enqueue(request: EnqueueRequest): boolean;
  flush(): Promise<void>;
  /** Expires entries from an earlier account day (the midnight tick). */
  sweep(): void;
  /**
   * Puts a failed entry back in line. A held one is first checked against current owner, date and permission and
   * reconciled before it is resent. False when it cannot be retried; the entry is then left exactly as it was.
   */
  retry(id: string): Promise<boolean>;
  dismiss(id: string): QueueEntry | undefined;
  dispose(): void;
}

/** The part of the capability that decides whether a tap may be queued. */
export type QueueWriteAccess = Pick<TrackerAccess, 'revision' | 'canWriteBasic' | 'canWriteCustom'>;

export const writeQueueKey = (userId: string) => `eiyu.writeQueue.v1.${userId}`;

/** A fresh four-field copy: only the revision is stored, never the capability it came from. */
const revisionOf = (r: TrackerRevision): TrackerRevision =>
  ({ userId: r.userId, ageVersion: r.ageVersion, consentVersion: r.consentVersion, authorityVersion: r.authorityVersion });
const snapshotOf = (t: TrackerTargetSnapshot): TrackerTargetSnapshot => ({ kind: t.kind, id: t.id, inputKind: t.inputKind });
const habitSnapshot = (entry: { habitId: string; trackerTargets?: TrackerTargetSnapshot[] }) =>
  entry.trackerTargets?.find(t => t.kind === 'habit' && t.id === entry.habitId);
/** Holds with these reasons keep later actions for the same habit waiting; a held one that merely expired does not. */
const isActiveHold = (entry: QueueEntry) =>
  entry.status === 'failed' && (entry.failure?.reason === 'tracker-paused' || entry.failure?.reason === 'purpose-paused');

export function createWriteQueueEngine(deps: WriteQueueDeps): WriteQueueEngine {
  const key = writeQueueKey(deps.userId);
  const listeners = new Set<(entries: QueueEntry[]) => void>();
  let entries: QueueEntry[] = [];
  let persistChain: Promise<unknown> = Promise.resolve();
  let running: Promise<void> | null = null;
  let rerun = false;
  let disposed = false;

  const emit = () => listeners.forEach(listener => listener(entries));

  // Reading starts at construction, so no write can be persisted ahead of what an earlier session left behind.
  const loading: Promise<void> = (async () => {
    let raw: string | null = null;
    try {
      raw = await deps.storage.getItem(key);
    } catch {
      raw = null;
    }
    // Held entries without a stamp get one now, so an old queue never expires the moment it is first read.
    const loaded = expireHeldEntries(decodeQueue(raw, deps.userId, deps.now().getTime()), deps.now().getTime());
    const revived = reviveEntries(loaded.entries, deps.now(), deps.timeZone());
    const known = new Set(revived.map(entry => entry.id));
    entries = [...revived, ...entries.filter(entry => !known.has(entry.id))];
    emit();
    for (const notice of loaded.expired) deps.onFailed?.(notice);
  })();
  void loading.then(() => persist());

  /**
   * Writes the newest state once the load has finished, so an early write can never replace what an earlier session
   * left behind. A write that has not started yet reads the newest state when it does, so changes made while one is
   * waiting share it instead of each queueing their own.
   */
  let waitingWrite: Promise<unknown> | null = null;
  const persist = (): Promise<unknown> => {
    if (waitingWrite) return waitingWrite;
    const write = persistChain
      .then(() => loading)
      .then(() => {
        waitingWrite = null;
        return entries.length > 0 ? deps.storage.setItem(key, encodeQueue(entries)) : deps.storage.removeItem(key);
      })
      .catch(() => {});
    waitingWrite = write;
    persistChain = write;
    return write;
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

  const fail = (entry: QueueEntry, reason: FailureReason, message: string =
    reason === 'day-passed' && isHeld(entry) ? HELD_ACTION_DAY_ENDED_MESSAGE : FAILURE_MESSAGES[reason]) => {
    patch(entry.id, { status: 'failed', failure: { reason, message } });
    deps.onFailed?.({ ...entry, status: 'failed', failure: { reason, message } });
  };

  const applied = async (entry: QueueEntry, result?: unknown) => {
    try {
      await deps.onApplied(entry, result);
    } catch {
      // The write landed; a failed refresh must not keep it in the queue.
    }
    remove(entry.id);
  };

  // Nothing jumps over an earlier held action of the same habit: it would be applied out of order after Retry.
  const nextEligible = (): QueueEntry | undefined => {
    const heldHabits = new Set<string>();
    for (const entry of entries) {
      if (isActiveHold(entry)) heldHabits.add(entry.habitId);
      else if ((entry.status === 'pending' || entry.status === 'uncertain') && !heldHabits.has(entry.habitId)) return entry;
    }
    return undefined;
  };

  /** Holds one entry for a purpose, revision or target reason. Its captured revision is left untouched. */
  const holdForProcessing = (entry: QueueEntry) => {
    const failure = { reason: 'purpose-paused' as const, message: FAILURE_MESSAGES['purpose-paused'] };
    const heldAt = entry.heldAt ?? deps.now().getTime();
    patch(entry.id, { status: 'failed', heldForProcessingPause: true, heldAt, failure });
    deps.onFailed?.({ ...entry, status: 'failed', heldForProcessingPause: true, heldAt, failure });
  };

  /** True when the habit is gone, was reclassified, cannot be written, or custom permission is missing for it. */
  const targetBlocked = (entry: QueueEntry, access: TrackerAccess, targets: readonly TrackerTarget[]): boolean => {
    const captured = habitSnapshot(entry);
    const live = targets.find(t => t.kind === 'habit' && t.id === entry.habitId);
    if (!captured || !live || live.inputKind !== captured.inputKind || !live.canWrite) return true;
    return captured.inputKind === 'custom' && !access.canWriteCustom;
  };

  const holdForTrackerPause = () => {
    const held = entries.filter(entry => entry.status !== 'failed');
    const stamp = deps.now().getTime();
    commit(entries.map(entry => entry.status !== 'failed' ? {
      ...entry, status: 'failed' as const, heldForTrackerPause: true as const, heldAt: entry.heldAt ?? stamp,
      failure: { reason: 'tracker-paused' as const, message: FAILURE_MESSAGES['tracker-paused'] },
    } : entry));
    for (const entry of held) deps.onFailed?.({ ...entry, status: 'failed', heldForTrackerPause: true, heldAt: entry.heldAt ?? stamp,
      failure: { reason: 'tracker-paused', message: FAILURE_MESSAGES['tracker-paused'] } });
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
      if (disposed) return false;
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

    const zone = deps.timeZone();
    if (zone === null) return false;
    if (isExpired(entry, deps.now(), zone)) { fail(entry, 'day-passed'); return true; }
    const attempts = entry.attempts + 1;
    patch(entry.id, { status: 'sending', attempts });
    await persist();
    // Signed out or switched account while the write was being recorded: it stays `sending` on disk, which the next
    // launch settles as uncertain, and nothing goes out under whoever is signed in now.
    if (disposed) return false;
    const sendZone = deps.timeZone();
    if (sendZone === null || deps.isOnline() === false) { patch(entry.id, { status: 'uncertain' }); return false; }
    if (isExpired(entry, deps.now(), sendZone)) { fail(entry, 'day-passed'); return true; }
    const sending: QueueEntry = { ...entry, status: 'sending', attempts };
    let result: unknown;
    try {
      result = await deps.send(sending);
    } catch (error) {
      const outcome = classifyError(entry.kind, error);
      switch (outcome.type) {
        case 'network':
          patch(entry.id, { status: 'uncertain' });
          return false;
        case 'auth':
          // Nothing ran on the server. Keep the attempt so the row still says it is waiting.
          patch(entry.id, { status: 'pending' });
          return false;
        case 'applied':
          await applied(sending);
          return true;
        case 'failed':
          if (outcome.reason === 'tracker-paused') {
            holdForTrackerPause();
            return false;
          }
          if (outcome.reason === 'purpose-paused') {
            holdForProcessing(sending);
            return true;
          }
          fail(sending, outcome.reason, outcome.message);
          return true;
        case 'retry':
          fail(sending, 'server', `${FAILURE_MESSAGES.server} (${outcome.message})`);
          return true;
      }
    }
    await applied(sending, result);
    return true;
  };

  const pass = async () => {
    for (;;) {
      if (disposed) return;
      sweep();
      // Sending needs a known account day; waiting is safe, guessing the day is not.
      if (deps.timeZone() === null || deps.isOnline() === false) return;
      const entry = nextEligible();
      if (!entry) return;
      // An action with no captured revision or target has no permission to rely on, and is never stamped with a new one.
      if (!entry.trackerRevision || !habitSnapshot(entry)) { holdForProcessing(entry); continue; }
      let fresh: Awaited<ReturnType<WriteQueueDeps['checkProcessingAccess']>>;
      try { fresh = await deps.checkProcessingAccess(entry); } catch { return; }
      if (disposed) return;
      // Access that is not this account's is never adopted.
      if (fresh?.access?.revision?.userId !== deps.userId) return;
      if (!fresh.access.canWriteBasic) { holdForTrackerPause(); return; }
      // The status request may cross midnight or a timezone change.
      sweep();
      if (deps.timeZone() === null || deps.isOnline() === false) return;
      const current = entries.find(candidate => candidate.id === entry.id && (candidate.status === 'pending' || candidate.status === 'uncertain'));
      if (!current) continue;
      if (targetBlocked(current, fresh.access, fresh.targets)) { holdForProcessing(current); continue; }
      if (!(await process(current))) return;
    }
  };

  const run = async () => {
    if (loading) await loading;
    do {
      rerun = false;
      await pass();
    } while (rerun && !disposed);
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
    // A closed queue belongs to an account that may have gone, so it must not give a notice to whoever is here now.
    if (disposed) return;
    // Held copies leave the device after 30 days; this needs no account zone, so it runs even before the profile loads.
    const held = expireHeldEntries(entries, deps.now().getTime());
    const next = expireEntries(held.entries, deps.now(), deps.timeZone());
    if (next !== entries) commit(next);
    for (const notice of held.expired) deps.onFailed?.(notice);
  }

  return {
    load: () => loading,
    getEntries: () => entries,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    enqueue(request) {
      const timeZone = deps.timeZone();
      if (timeZone === null) return false;
      const access = request.trackerAccess;
      // A known denial stores nothing, not even the label. Another account's grant is never adopted.
      if (!access || access.revision?.userId !== deps.userId || !access.canWriteBasic) return false;
      const targets = Array.isArray(request.trackerTargets) ? request.trackerTargets : [];
      const habit = targets.find(t => t.kind === 'habit' && t.id === request.habitId);
      if (!habit) return false;
      if (targets.some(t => t.inputKind === 'custom') && !access.canWriteCustom) return false;
      commit(enqueueEntry(entries, {
        id: deps.newId(),
        userId: deps.userId,
        kind: request.kind,
        habitId: request.habitId,
        accountDate: accountDateKey(deps.now(), timeZone),
        delta: request.delta,
        base: request.base,
        label: request.label,
        now: deps.now().getTime(),
        trackerRevision: revisionOf(access.revision),
        trackerTargets: [snapshotOf(habit)],
      }));
      return true;
    },
    flush,
    sweep,
    async retry(id) {
      const retryable = (candidate: QueueEntry | undefined): candidate is QueueEntry =>
        !!candidate && candidate.userId === deps.userId && candidate.status === 'failed' && candidate.failure?.reason !== 'day-passed';
      const pastDay = (candidate: QueueEntry) => {
        const zone = deps.timeZone();
        return zone !== null && isExpired(candidate, deps.now(), zone);
      };
      sweep();
      const entry = entries.find(candidate => candidate.id === id);
      if (!retryable(entry) || pastDay(entry)) return false;
      let fresh: Awaited<ReturnType<WriteQueueDeps['checkProcessingAccess']>>;
      try { fresh = await deps.checkProcessingAccess(entry); } catch { return false; }
      if (disposed) return false;
      // The check can take a while: judge the entry as it is now, and the day as it is now.
      const current = entries.find(candidate => candidate.id === id);
      if (!retryable(current) || pastDay(current)) return false;
      const access = fresh?.access;
      if (access?.revision?.userId !== deps.userId || !access.canWriteBasic) return false;
      const live = fresh.targets?.find(t => t.kind === 'habit' && t.id === current.habitId);
      if (!live || !live.canWrite) return false;
      // Renewing is only for an unchanged kind. A record that became custom needs review, never adoption; an entry
      // that never captured a kind can only be renewed as basic.
      const captured = habitSnapshot(current);
      if ((captured ? captured.inputKind : 'basic') !== live.inputKind) return false;
      if (live.inputKind === 'custom' && !access.canWriteCustom) return false;
      // A held request may already have committed before the pause. Reconcile
      // even apparently pending entries rather than losing that uncertainty.
      patch(id, {
        status: isHeld(current) ? 'uncertain' : 'pending', attempts: 0, failure: undefined,
        trackerRevision: revisionOf(access.revision), trackerTargets: [snapshotOf(live)],
      });
      return true;
    },
    dismiss(id) {
      const entry = entries.find(candidate => candidate.id === id);
      if (entry) remove(id);
      return entry;
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}
