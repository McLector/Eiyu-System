import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  archiveHabit,
  deleteHabit,
  completeHabit,
  completeHabitRecovery,
  createHabit,
  deleteLongQuest,
  fetchBacklogQuests,
  fetchLongQuests,
  fetchProfile,
  updateProfile,
  fetchStats,
  fetchTodayHabits,
  formatError,
  incrementHabitProgress,
  initialUser,
  applyManualOrder,
  hasManualOrder,
  reorderLongQuests,
  reorderQuests as reorderQuestsRequest,
  moveBacklogToOneTime,
  moveOneTimeToBacklog,
  rankFromStats,
  setStageDoneWithReceipt,
  saveAtomicLongQuest,
  type RewardReceipt,
  accountDateKey,
  deviceTimeZone,
  millisecondsUntilNextAccountDay,
  undoCompletion,
  updateHabit,
  restoreHabit,
  copyTrackerRevision,
  TRACKER_ACCESS_MESSAGE,
  prepareDay,
  type ChainEditorInput,
  type HabitEditorInput,
  type LongQuest,
  type Quest,
  type TrackerAccess,
  type TrackerTargetSnapshot,
  type QuestType,
  type UserProfile,
} from '@eiyu/shared';

import { stageNotice } from '@eiyu/shared';
import { useSession } from './session-context';
import { isTrackerTargetGone, isUnansweredTrackerWrite } from '@eiyu/shared';
import {
  readTrackerAccess, refreshTrackerAfterFailure, safeTrackerErrorKind, snapshotOf,
  trackerErrorMessage, trackerKey, useTrackerAccess, writeDenial, type TrackedRecord,
} from './tracker';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

const habitsTodayKey = (userId?: string) => ['habits', 'today', userId ?? null] as const;
const backlogKey = (userId?: string) => ['backlog', userId ?? null] as const;
const longQuestsKey = (userId?: string) => ['longQuests', userId ?? null] as const;

interface EiyuStore {
  user: UserProfile;
  questsLoading: boolean;
  questsError: string | null;
  retryQuests: () => Promise<void>;
  /** Backlog quests: ideas with no date, newest first. */
  backlog: Quest[];
  backlogLoading: boolean;
  /** Server-dated to the account's today; single-flight per quest. */
  moveToOneTime: (id: string) => Promise<void>;
  moveToBacklog: (id: string) => Promise<void>;
  /**
   * Manual order (044). `ids` are the unfinished quests of one lane in their new order. The new order shows at once;
   * the server's answer then replaces it, and a refusal puts the old order back. Moves in one lane run in turn.
   */
  reorderQuests: (lane: QuestType, ids: string[]) => Promise<void>;
  /** The same for the Chain list. */
  reorderChains: (ids: string[]) => Promise<void>;
  /** Full completion if not yet done, undo if already done. */
  toggleQuest: (id: string) => Promise<boolean>;
  /** Slice 5: adjust a quantity habit's today progress by delta, clamped server-side. */
  adjustProgress: (id: string, delta: number) => void;
  /** Ask the server to resolve the authoritative open recovery window. */
  completeRecovery: (id: string) => void;
  saveHabit: (input: HabitEditorInput, existingId?: string) => Promise<void>;
  /** The signed-in owner's loaded tracker capability; null until it is read (every tracker write is refused meanwhile). */
  tracker: TrackerAccess | null;
  archiveQuest: (id: string) => Promise<void>;
  restoreQuest: (id: string) => Promise<void>;
  deleteQuest: (id: string) => Promise<void>;
  toggleStage: (lqId: string, stageId: string) => void;
  stageRewardNotice: string | null;
  rewardReceipt: RewardReceipt | null;
  pendingStageIds: string[];
  longQuestsLoading: boolean;
  longQuestsError: string | null;
  retryLongQuests: () => Promise<void>;
  saveLongQuest: (input: ChainEditorInput, existingId?: string) => Promise<void>;
  removeLongQuest: (id: string) => Promise<void>;
  saveProfile: (input: { displayName: string; userClass: string }) => Promise<void>;
}

const EiyuContext = createContext<EiyuStore | null>(null);

export function EiyuProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user.id;
  const qc = useQueryClient();

  const [questActionError, setQuestActionError] = useState<string | null>(null);
  const [retryingQuests, setRetryingQuests] = useState(false);
  const [retryingLongQuests, setRetryingLongQuests] = useState(false);
  const [stageRewardNotice, setStageRewardNotice] = useState<string | null>(null);
  const [rewardReceipt, setRewardReceipt] = useState<RewardReceipt | null>(null);
  const [pendingStageIds, setPendingStageIds] = useState<string[]>([]);
  const rewardRequests = useRef(new Map<string, string>());
  const definitionRequests = useRef(new Map<string, { id: string; request: string }>());
  const [lqActionError, setLqActionError] = useState<string | null>(null);
  const lifecycleRequests = useRef(new Map<string, Promise<void>>());
  const reorderQueues = useRef(new Map<string, Promise<void>>());
  const deletedHabitIds = useRef(new Set<string>());
  const stageRequests = useRef(new Set<string>());
  const activeUserId = useRef(userId);
  const creationIds = useRef(new Map<string, string>());
  // Deletes whose answer was never seen: a later 42501 for the same id means the first attempt did land.
  const attemptedDeletes = useRef(new Set<string>());

  const trackerQuery = useTrackerAccess(userId);
  const tracker = trackerQuery.data && trackerQuery.data.revision.userId === userId ? trackerQuery.data : null;
  const trackerRef = useRef<TrackerAccess | null>(null);
  trackerRef.current = tracker;

  // Preparation comes first and is never required for reading: a failed or paused preparation still shows history.
  const prepareBoard = useCallback(async (owner: string) => {
    try {
      const access = await qc.fetchQuery({ queryKey: trackerKey(owner), queryFn: () => readTrackerAccess(owner), staleTime: 0 });
      if (access.revision.userId !== owner) return;
      const result = await prepareDay(copyTrackerRevision(access.revision));
      if (result.accessChanged) await qc.invalidateQueries({ queryKey: trackerKey(owner) });
    } catch { /* Preparation is optional for reading; the board read below does not depend on it. */ }
  }, [qc]);

  const habitsQuery = useQuery({
    queryKey: habitsTodayKey(userId),
    queryFn: async () => { await prepareBoard(userId!); return fetchTodayHabits(userId!); },
    enabled: !!userId,
  });
  // Read Backlog only after the board read: that read runs the server rollover that can add quests to Backlog.
  const backlogQuery = useQuery({
    queryKey: backlogKey(userId),
    queryFn: () => fetchBacklogQuests(userId!),
    enabled: !!userId && habitsQuery.isSuccess,
  });
  const profileQuery = useQuery({
    queryKey: ['profile', userId ?? null],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  });
  const statsQuery = useQuery({
    queryKey: ['stats', userId ?? null],
    queryFn: () => fetchStats(userId!),
    enabled: !!userId,
  });
  const longQuestsQuery = useQuery({
    queryKey: longQuestsKey(userId),
    queryFn: () => fetchLongQuests(userId!),
    enabled: !!userId,
  });

  const quests = useMemo(() => habitsQuery.data ?? [], [habitsQuery.data]);
  const backlog = useMemo(() => backlogQuery.data ?? [], [backlogQuery.data]);
  const longQuests = useMemo(() => longQuestsQuery.data ?? [], [longQuestsQuery.data]);
  const stats = useMemo(() => statsQuery.data ?? initialUser.stats, [statsQuery.data]);
  const profile = profileQuery.data ?? null;

  useEffect(() => {
    if (!userId || !profile?.timeZone) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNextRollover = () => {
      const delay = millisecondsUntilNextAccountDay(new Date(), profile.timeZone) + 50;
      timer = setTimeout(() => {
        if (!active) return;
        qc.invalidateQueries({ queryKey: habitsTodayKey(userId) })
          .then(() => qc.invalidateQueries({ queryKey: backlogKey(userId) }))
          .finally(scheduleNextRollover);
      }, delay);
    };
    scheduleNextRollover();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [profile?.timeZone, qc, userId]);

  // Clear client-side deletion guards whenever the authenticated owner
  // changes so a matching UUID in another account is never blocked.
  useEffect(() => {
    deletedHabitIds.current.clear();
    stageRequests.current.clear();
    setStageRewardNotice(null);
    setRewardReceipt(null);
    setPendingStageIds([]);
    rewardRequests.current.clear();
    definitionRequests.current.clear();
    creationIds.current.clear();
    attemptedDeletes.current.clear();
  }, [userId]);
  useEffect(() => {
    const previousUserId = activeUserId.current;
    if (previousUserId && previousUserId !== userId) {
      qc.removeQueries({ predicate: query => query.queryKey.includes(previousUserId) });
    }
    if (!userId) qc.removeQueries();
    activeUserId.current = userId;
  }, [qc, userId]);

  // A failed Backlog read is a board error too; otherwise it would look like an empty Backlog.
  const questsLoadError = retryingQuests
    ? undefined
    : [habitsQuery.error, backlogQuery.error, profileQuery.error, statsQuery.error].find((e): e is Error => !!e);
  const questsError = questsLoadError ? formatError(questsLoadError) : questActionError;
  const longQuestsError =
    longQuestsQuery.isPending || retryingLongQuests
      ? null
      : longQuestsQuery.error
        ? formatError(longQuestsQuery.error)
        : lqActionError;

  const questsRef = useRef<Quest[]>([]);
  const backlogRef = useRef<Quest[]>([]);
  const longQuestsRef = useRef<LongQuest[]>([]);
  questsRef.current = quests;
  backlogRef.current = backlog;
  longQuestsRef.current = longQuests;
  const findQuest = (id: string) => questsRef.current.find(q => q.id === id) ?? backlogRef.current.find(q => q.id === id);

  /**
   * Decide a write before anything is sent. Copies the revision and builds the target snapshots synchronously from the
   * loaded view models, so a later refresh cannot retarget the request. A known denial throws and nothing is sent.
   */
  const authorize = (kind: 'habit' | 'chain', records: readonly (TrackedRecord & { id: string })[], extra?: (access: TrackerAccess) => string | null) => {
    const access = trackerRef.current;
    const denial = writeDenial(access) ?? (access ? extra?.(access) ?? null : null);
    if (denial || !access) throw new Error(denial ?? TRACKER_ACCESS_MESSAGE);
    const seen = new Set<string>();
    const targets: TrackerTargetSnapshot[] = [];
    for (const record of records) if (!seen.has(record.id)) { seen.add(record.id); targets.push(snapshotOf(kind, record)); }
    return { expected: copyTrackerRevision(access.revision), targets };
  };
  const NOT_LOADED = 'That item is not loaded any more. Reload and try again.';
  const habitsOrThrow = (ids: string[]) => ids.map(id => findQuest(id) ?? (() => { throw new Error(NOT_LOADED); })());
  const chainsOrThrow = (ids: string[]) => ids.map(id => longQuestsRef.current.find(q => q.id === id) ?? (() => { throw new Error(NOT_LOADED); })());

  /** After a refused or stale write: re-read access and the lists (never replay), and word the error for people. */
  const afterRefusal = (err: unknown): Error => {
    refreshTrackerAfterFailure(qc, userId, err);
    if (safeTrackerErrorKind(err) === 'access-changed') {
      void qc.invalidateQueries({ queryKey: ['habits'] });
      void qc.invalidateQueries({ queryKey: ['backlog'] });
      void qc.invalidateQueries({ queryKey: longQuestsKey(userId) });
    }
    const message = trackerErrorMessage(err);
    return message ? new Error(message) : err instanceof Error ? err : new Error(formatError(err));
  };
  /** Optimistic completion with rollback. */
  const runCompletion = useCallback(
    async (id: string, action: () => Promise<void>, optimisticCompleted: boolean) => {
      if (!userId) return false;
      const key = habitsTodayKey(userId);
      qc.setQueryData<Quest[]>(key, qs =>
        qs?.map(q => (q.id === id ? { ...q, completed: optimisticCompleted } : q))
      );
      try {
        await action();
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['stats', userId] }),
          qc.invalidateQueries({ queryKey: key }),
          qc.invalidateQueries({ queryKey: ['monthHistory', userId] }),
          qc.invalidateQueries({ queryKey: ['historyRange', userId] }),
        ]);
        setQuestActionError(null);
        return true;
      } catch (err) {
        qc.setQueryData<Quest[]>(key, qs =>
          qs?.map(q => (q.id === id ? { ...q, completed: !optimisticCompleted } : q))
        );
        const shown = afterRefusal(err);
        if (activeUserId.current === userId) setQuestActionError(formatError(shown));
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, qc]
  );

  const toggleQuest = useCallback(
    (id: string): Promise<boolean> => {
      const quest = quests.find(q => q.id === id);
      if (!quest || !userId) return Promise.resolve(false);
      let gate: ReturnType<typeof authorize>;
      try { gate = authorize('habit', [quest]); } catch (err) { setQuestActionError(formatError(err)); return Promise.resolve(false); }
      const { expected, targets } = gate;
      if (quest.completed) {
        return runCompletion(
          id,
          () => undoCompletion(userId, id, quest.stat, expected, targets, profile?.timeZone),
          false
        );
      } else {
        return runCompletion(
          id,
          () => completeHabit(userId, id, quest.stat, 'full', expected, targets, undefined, profile?.timeZone),
          true
        );
      }
    },
    [quests, userId, runCompletion, profile?.timeZone]
  );

  /**
   * Slice 5: bump a quantity habit's today progress by `delta`, clamped
   * server-side. Optimistic locally, then reconciled to the RPC's returned
   * count — a rapid string of taps produces overlapping in-flight calls,
   * and whichever response lands last should win, not whichever request
   * was issued last.
   */
  const adjustProgress = useCallback(
    (id: string, delta: number) => {
      const quest = quests.find(q => q.id === id);
      if (!quest || !userId || quest.targetCount == null) return;
      let gate: ReturnType<typeof authorize>;
      try { gate = authorize('habit', [quest]); } catch (err) { setQuestActionError(formatError(err)); return; }
      const { expected, targets } = gate;
      const target = quest.targetCount;
      const key = habitsTodayKey(userId);
      const prevProgress = quest.progressCount;
      const prevCompleted = quest.completed;
      const optimisticNew = Math.max(0, Math.min(target, prevProgress + delta));
      qc.setQueryData<Quest[]>(key, qs =>
        qs?.map(q => (q.id === id ? { ...q, progressCount: optimisticNew, completed: optimisticNew >= target } : q))
      );
      incrementHabitProgress(
        id,
        accountDateKey(new Date(), profile?.timeZone ?? deviceTimeZone()),
        delta,
        expected,
        targets
      )
        .then(async serverCount => {
          qc.setQueryData<Quest[]>(key, qs =>
            qs?.map(q => (q.id === id ? { ...q, progressCount: serverCount, completed: serverCount >= target } : q))
          );
          await Promise.all([
            qc.invalidateQueries({ queryKey: ['stats', userId] }),
            qc.invalidateQueries({ queryKey: ['monthHistory', userId] }),
            qc.invalidateQueries({ queryKey: ['historyRange', userId] }),
          ]);
          setQuestActionError(null);
        })
        .catch(err => {
          qc.setQueryData<Quest[]>(key, qs =>
            qs?.map(q => (q.id === id ? { ...q, progressCount: prevProgress, completed: prevCompleted } : q))
          );
          const shown = afterRefusal(err);
          if (activeUserId.current === userId) setQuestActionError(formatError(shown));
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quests, userId, qc, profile?.timeZone]
  );

  const completeRecovery = useCallback(
    async (id: string) => {
      const quest = quests.find(q => q.id === id);
      if (!quest || !userId || !quest.frozen) return;
      try {
        const { expected, targets } = authorize('habit', [quest]);
        await completeHabitRecovery(id, expected, targets);
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['stats', userId] }),
          qc.invalidateQueries({ queryKey: habitsTodayKey(userId) }),
          qc.invalidateQueries({ queryKey: ['monthHistory', userId] }),
          qc.invalidateQueries({ queryKey: ['historyRange', userId] }),
        ]);
        setQuestActionError(null);
      } catch (err) {
        const shown = afterRefusal(err);
        if (activeUserId.current === userId) setQuestActionError(formatError(shown));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quests, userId, qc]
  );

  const saveHabit = useCallback(
    async (input: HabitEditorInput, existingId?: string) => {
      if (!userId) return;
      if (existingId && deletedHabitIds.current.has(existingId)) {
        throw new Error('This quest was deleted. Close this editor and reload the board.');
      }
      const existing = existingId ? findQuest(existingId) : undefined;
      if (existingId && !existing) throw new Error(NOT_LOADED);
      // Decided and captured before any await; nothing is sent on a known denial.
      const { expected, targets } = authorize('habit', existing ? [existing] : [], () => {
        if (input.mode === 'basic' && existing?.inputKind === 'custom') return 'A quest with custom details cannot go back to basic tracking.';
        return null;
      });
      const creationId = existing ? undefined : creationIds.current.get('habit') ?? crypto.randomUUID();
      if (creationId) creationIds.current.set('habit', creationId);
      try {
        if (existing && existingId) await updateHabit(existingId, input, expected, targets, existing.name);
        else await createHabit(userId, input, expected, creationId!);
        creationIds.current.delete('habit');
      } catch (err) {
        // A confirmed refusal means nothing was created, so the next attempt starts with a fresh id.
        if (safeTrackerErrorKind(err)) creationIds.current.delete('habit');
        throw afterRefusal(err);
      }
      await Promise.all([qc.invalidateQueries({ queryKey: ['habits'] }), qc.invalidateQueries({ queryKey: ['backlog'] })]);
      setQuestActionError(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, qc]
  );

  const runLifecycle = useCallback(
    (id: string, operation: 'archive' | 'restore' | 'delete'): Promise<void> => {
      const existing = lifecycleRequests.current.get(id);
      if (existing) return existing;

      const request = (async () => {
        try {
          const { expected, targets } = authorize('habit', habitsOrThrow([id]));
          if (operation === 'archive') await archiveHabit(id, expected, targets);
          if (operation === 'restore') await restoreHabit(id, expected, targets);
          if (operation === 'delete') {
            try { await deleteHabit(id, expected, targets); } catch (err) {
              // Delete is not idempotent: "target unavailable" after our own unanswered attempt means it already landed.
              const landed = attemptedDeletes.current.has(id) && isTrackerTargetGone(err);
              attemptedDeletes.current.delete(id);
              if (!landed) { if (isUnansweredTrackerWrite(err)) attemptedDeletes.current.add(id); throw err; }
            }
            attemptedDeletes.current.delete(id);
          }

          if (operation === 'delete') {
            deletedHabitIds.current.add(id);
            qc.setQueriesData<Quest[]>({ queryKey: ['habits'] }, rows => rows?.filter(row => row.id !== id));
            qc.setQueriesData<Quest[]>({ queryKey: ['backlog'] }, rows => rows?.filter(row => row.id !== id));
          }
          await Promise.all([qc.invalidateQueries({ queryKey: ['habits'] }), qc.invalidateQueries({ queryKey: ['backlog'] })]);
          setQuestActionError(null);
        } catch (err) {
          const shown = afterRefusal(err);
          setQuestActionError(formatError(shown));
          throw shown;
        }
      })();

      lifecycleRequests.current.set(id, request);
      request.then(
        () => lifecycleRequests.current.delete(id),
        () => lifecycleRequests.current.delete(id)
      );
      return request;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, userId]
  );

  const archiveQuest = useCallback((id: string) => runLifecycle(id, 'archive'), [runLifecycle]);
  const restoreQuest = useCallback((id: string) => runLifecycle(id, 'restore'), [runLifecycle]);
  const deleteQuest = useCallback((id: string) => runLifecycle(id, 'delete'), [runLifecycle]);

  const runMove = useCallback(
    (id: string, direction: 'to-one-time' | 'to-backlog'): Promise<void> => {
      const existing = lifecycleRequests.current.get(id);
      if (existing) return existing;
      const request = (async () => {
        try {
          const { expected, targets } = authorize('habit', habitsOrThrow([id]));
          if (direction === 'to-one-time') await moveBacklogToOneTime(id, expected, targets);
          else await moveOneTimeToBacklog(id, expected, targets);
          await Promise.all([qc.invalidateQueries({ queryKey: ['habits'] }), qc.invalidateQueries({ queryKey: ['backlog'] })]);
          setQuestActionError(null);
        } catch (err) {
          const shown = afterRefusal(err);
          setQuestActionError(formatError(shown));
          throw shown;
        }
      })();
      lifecycleRequests.current.set(id, request);
      request.then(() => lifecycleRequests.current.delete(id), () => lifecycleRequests.current.delete(id));
      return request;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, userId]
  );
  const moveToOneTime = useCallback((id: string) => runMove(id, 'to-one-time'), [runMove]);
  const moveToBacklog = useCallback((id: string) => runMove(id, 'to-backlog'), [runMove]);

  /** Runs saves for one list in the order they were asked for; a failed one does not stop the next. */
  const inTurn = useCallback((key: string, run: () => Promise<void>): Promise<void> => {
    const next = (reorderQueues.current.get(key) ?? Promise.resolve()).catch(() => undefined).then(run);
    reorderQueues.current.set(key, next);
    const clear = () => { if (reorderQueues.current.get(key) === next) reorderQueues.current.delete(key); };
    next.then(clear, clear);
    return next;
  }, []);

  const reorderQuests = useCallback(
    (lane: QuestType, ids: string[]): Promise<void> => {
      if (!userId) return Promise.resolve();
      let gate: ReturnType<typeof authorize>;
      try { gate = authorize('habit', habitsOrThrow(ids)); } catch (err) { setQuestActionError(formatError(err)); return Promise.reject(err); }
      const { expected, targets } = gate;
      if (lane === 'backlog') {
        qc.setQueryData<Quest[]>(backlogKey(userId), rows => (rows ? applyManualOrder(rows, ids) : rows));
      } else {
        qc.setQueryData<Quest[]>(habitsTodayKey(userId), rows => {
          const laneRows = rows?.filter(row => row.questType === lane) ?? [];
          if (!rows || !hasManualOrder(laneRows)) return rows;
          const placed = new Map(applyManualOrder(laneRows, ids).map(row => [row.id, row]));
          return rows.map(row => placed.get(row.id) ?? row);
        });
      }
      return inTurn(`quests:${lane}`, async () => {
        try {
          await reorderQuestsRequest(lane, ids, expected, targets);
          setQuestActionError(null);
        } catch (err) {
          const shown = afterRefusal(err);
          setQuestActionError(formatError(shown));
          throw shown;
        } finally {
          // The server's numbering replaces the optimistic one; after a refusal this is what puts the old order back.
          await Promise.all([qc.invalidateQueries({ queryKey: ['habits'] }), qc.invalidateQueries({ queryKey: ['backlog'] })]);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, userId, inTurn]
  );

  const reorderChains = useCallback(
    (ids: string[]): Promise<void> => {
      if (!userId) return Promise.resolve();
      let gate: ReturnType<typeof authorize>;
      try { gate = authorize('chain', chainsOrThrow(ids)); } catch (err) { setLqActionError(formatError(err)); return Promise.reject(err); }
      const { expected, targets } = gate;
      qc.setQueryData<LongQuest[]>(longQuestsKey(userId), rows => (rows ? applyManualOrder(rows, ids) : rows));
      return inTurn('chains', async () => {
        try {
          await reorderLongQuests(ids, expected, targets);
          setLqActionError(null);
        } catch (err) {
          const shown = afterRefusal(err);
          setLqActionError(formatError(shown));
          throw shown;
        } finally {
          await qc.invalidateQueries({ queryKey: longQuestsKey(userId) });
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qc, userId, inTurn]
  );

  const retryQuests = useCallback(async () => {
    setQuestActionError(null);
    setRetryingQuests(true);
    await Promise.all([
      qc.refetchQueries({ queryKey: habitsTodayKey(userId), type: 'active' }),
      qc.refetchQueries({ queryKey: backlogKey(userId), type: 'active' }),
      qc.refetchQueries({ queryKey: ['profile', userId], type: 'active' }),
      qc.refetchQueries({ queryKey: ['stats', userId], type: 'active' }),
    ]).finally(() => setRetryingQuests(false));
  }, [qc, userId]);

  const retryLongQuests = useCallback(async () => {
    setLqActionError(null);
    setRetryingLongQuests(true);
    try {
      await qc.refetchQueries({ queryKey: longQuestsKey(userId), type: 'active' });
    } finally {
      setRetryingLongQuests(false);
    }
  }, [qc, userId]);

  const toggleStage = useCallback(
    async (lqId: string, stageId: string) => {
      const lq = longQuests.find(q => q.id === lqId);
      const stage = lq?.stages.find(s => s.id === stageId);
      if (!stage || !userId || stageRequests.current.has(lqId)) return;
      let gate: ReturnType<typeof authorize>;
      try { gate = authorize('chain', [lq!]); } catch (err) { setLqActionError(formatError(err)); return; }
      const { expected, targets } = gate;
      stageRequests.current.add(lqId);
      const nextDone = !stage.done;
      const key = longQuestsKey(userId);
      setPendingStageIds(ids => [...ids, stageId]);
      const operation = stageId + ':' + nextDone;
      const requestId = rewardRequests.current.get(operation) ?? crypto.randomUUID();
      rewardRequests.current.set(operation, requestId);
      try {
        const receipt = await setStageDoneWithReceipt(stageId, nextDone, requestId, expected, targets);
        rewardRequests.current.delete(operation);
        qc.setQueryData<LongQuest[]>(key, lqs => lqs?.map(q => q.id === lqId ? { ...q, stages: q.stages.map(s => s.id === stageId ? { ...s, done: receipt.done } : s) } : q));
        if (activeUserId.current !== userId) return;
        setLqActionError(null);
        setRewardReceipt(receipt.replayed ? null : receipt);
        setStageRewardNotice(stageNotice(receipt.replayed ? 'replayed' : receipt.changed ? (nextDone ? 'completed' : 'undone') : 'unchanged'));
      } catch (err) {
        const shown = afterRefusal(err);
        if (activeUserId.current === userId) {
          setLqActionError(formatError(shown));
          setStageRewardNotice(null);
        }
      } finally {
        await qc.invalidateQueries({ queryKey: key });
        await qc.invalidateQueries({ queryKey: ['stats', userId] });
        stageRequests.current.delete(lqId);
        setPendingStageIds(ids => ids.filter(id => id !== stageId));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [longQuests, userId, qc]
  );

  const saveLongQuest = useCallback(
    async (input: ChainEditorInput, existingId?: string) => {
      if (!userId) return;
      const existing = existingId ? longQuestsRef.current.find(q => q.id === existingId) : undefined;
      if (existingId && !existing) throw new Error(NOT_LOADED);
      const { expected, targets } = authorize('chain', existing ? [existing] : [], () => {
        if (input.mode === 'basic' && existing?.inputKind === 'custom') return 'A chain with custom details cannot go back to basic tracking.';
        return null;
      });
      const operation = existingId ?? 'new';
      const stable = definitionRequests.current.get(operation) ?? { id: existingId ?? crypto.randomUUID(), request: crypto.randomUUID() };
      definitionRequests.current.set(operation, stable);
      try {
        await saveAtomicLongQuest(stable.id, stable.request, input, !existingId, expected, targets, existing?.name);
      } catch (err) {
        if (safeTrackerErrorKind(err)) definitionRequests.current.delete(operation);
        throw afterRefusal(err);
      }
      definitionRequests.current.delete(operation);
      await qc.invalidateQueries({ queryKey: longQuestsKey(userId) });
      setLqActionError(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, qc]
  );

  const removeLongQuest = useCallback(
    async (id: string) => {
      const { expected, targets } = authorize('chain', chainsOrThrow([id]));
      try { await deleteLongQuest(id, expected, targets); } catch (err) { throw afterRefusal(err); }
      await qc.invalidateQueries({ queryKey: longQuestsKey(userId) });
      setLqActionError(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, qc]
  );

  const saveProfile = useCallback(
    async (input: { displayName: string; userClass: string }) => {
      const updated = await updateProfile(input, profile ? {
        displayName: profile.displayName, userClass: profile.userClass,
      } : undefined);
      qc.setQueryData(['profile', userId ?? null], updated);
    },
    [qc, userId, profile]
  );

  const user: UserProfile = useMemo(
    () => ({
      name: profile?.displayName ?? initialUser.name,
      userClass: profile?.userClass ?? initialUser.userClass,
      timeZone: profile?.timeZone ?? deviceTimeZone(),
      rank: rankFromStats(stats),
      stats,
      quests,
      longQuests,
    }),
    [profile, stats, quests, longQuests]
  );

  const value = useMemo<EiyuStore>(
    () => ({
      user,
      questsLoading:
        habitsQuery.isLoading || profileQuery.isLoading || statsQuery.isLoading || retryingQuests,
      questsError,
      retryQuests,
      backlog,
      backlogLoading: backlogQuery.isLoading,
      moveToOneTime,
      moveToBacklog,
      reorderQuests,
      reorderChains,
      toggleQuest,
      adjustProgress,
      completeRecovery,
      saveHabit,
      tracker,
      archiveQuest,
      restoreQuest,
      deleteQuest,
      toggleStage,
      stageRewardNotice,
      rewardReceipt,
      pendingStageIds,
      longQuestsLoading: longQuestsQuery.isLoading || retryingLongQuests,
      longQuestsError,
      retryLongQuests,
      saveLongQuest,
      removeLongQuest,
      saveProfile,
    }),
    [
      user,
      habitsQuery.isLoading,
      profileQuery.isLoading,
      statsQuery.isLoading,
      retryingQuests,
      questsError,
      retryQuests,
      backlog,
      backlogQuery.isLoading,
      moveToOneTime,
      moveToBacklog,
      reorderQuests,
      reorderChains,
      toggleQuest,
      adjustProgress,
      completeRecovery,
      saveHabit,
      tracker,
      archiveQuest,
      restoreQuest,
      deleteQuest,
      toggleStage,
      stageRewardNotice,
      rewardReceipt,
      pendingStageIds,
      longQuestsQuery.isLoading,
      retryingLongQuests,
      longQuestsError,
      retryLongQuests,
      saveLongQuest,
      removeLongQuest,
      saveProfile,
    ]
  );

  return <EiyuContext.Provider value={value}>{children}</EiyuContext.Provider>;
}

export function useEiyu() {
  const ctx = useContext(EiyuContext);
  if (!ctx) throw new Error('useEiyu must be used within EiyuProvider');
  return ctx;
}
