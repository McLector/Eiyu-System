/**
 * Eiyu store - Phase 3 improvement pass.
 *
 * TanStack Query is now the fetch/cache engine: stale-while-revalidate reads,
 * request dedup, retry, and AsyncStorage persistence (local-first hydrate).
 * The useEiyu() public API below is UNCHANGED from the pre-Phase-3 store -
 * screens consume it exactly as before; only the internals moved.
 *
 * Side-effect orchestration that does not map onto queries lives in effects
 * inside this provider:
 * - frozen-recovery notifications fire only on the transition INTO frozen,
 *   never on cold/hydrated loads (those are seeded silently);
 * - reminder rescheduling follows userId/notificationsEnabled;
 * - the weekly quest chains off freshly loaded stats.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
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

import { initialUser } from '@eiyu/shared';
import { darkTheme, lightTheme, type EiyuTheme } from '@/constants/eiyu-theme';
import { useAuth } from '@/contexts/auth-store';
import { completeHabit, completeHabitRecovery, undoCompletion, incrementHabitProgress } from '@eiyu/shared';
import { rankFromStats } from '@eiyu/shared';
import { formatError } from '@eiyu/shared';
import { accountDateKey, deviceTimeZone, millisecondsUntilNextAccountDay } from '@eiyu/shared';
import {
  archiveHabit,
  createHabit,
  deleteHabit,
  fetchAllActiveHabits,
  fetchUpcomingOneTimeHabits,
  fetchTodayHabits,
  HabitInput,
  restoreHabit,
  updateHabit,
} from '@eiyu/shared';
import {
  getNotificationsEnabled,
  setNotificationsEnabled as persistNotificationsEnabled,
} from '@/lib/notification-prefs';
import {
  cancelAllHabitReminders,
  ensureNotificationSetup,
  inspectNotificationPermissions,
  notifyRecoveryQuestGenerated,
  requestNotificationPermissions,
  scheduleOneTimeReminder,
  scheduleHabitReminders,
} from '@/lib/notifications';
import {
  createLongQuest,
  deleteLongQuest,
  fetchLongQuests,
  LongQuestInput,
  reconcileLongQuestStages,
  setStageDone,
  updateLongQuest,
} from '@eiyu/shared';
import { fetchProfile, updateProfile } from '@eiyu/shared';
import { fetchStats } from '@eiyu/shared';
import { fetchOrCreateWeeklyQuest, WeeklyQuest } from '@eiyu/shared';
import { LongQuest, Quest, UserProfile } from '@eiyu/shared';

/** App-wide client - also used by PersistQueryClientProvider in app/_layout.tsx. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Local-first feel: cached data renders instantly, background revalidate
      // happens on mount after a minute. Mutations invalidate explicitly.
      staleTime: 60_000,
      // Must be >= the persister's maxAge (app/_layout) - a query GC'd out of
      // memory before maxAge expires silently drops out of persistence too.
      gcTime: 7 * 24 * 60 * 60 * 1000,
      retry: 1,
    },
  },
});

export const persister = createAsyncStoragePersister({ storage: AsyncStorage });

const habitsTodayKey = (userId?: string) => ['habits', 'today', userId ?? null] as const;
const longQuestsKey = (userId?: string) => ['longQuests', userId ?? null] as const;

interface EiyuStore {
  user: UserProfile;
  theme: EiyuTheme;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  questsLoading: boolean;
  questsError: string | null;
  /** Re-fetch today's quests after a load failure (e.g. a transient network/auth error). */
  retryQuests: () => Promise<void>;
  /** Full completion if not yet done, undo if already done (R-05, R-07). */
  toggleQuest: (id: string) => void;
  /** Easy/recovery-version completion (R-06). */
  completeEasy: (id: string) => void;
  /** Slice 5: adjust a quantity habit's today progress by delta, clamped server-side. */
  adjustProgress: (id: string, delta: number) => void;
  /** R-13: ask the server to resolve the authoritative open recovery window. */
  completeRecovery: (id: string) => void;
  saveHabit: (input: HabitInput, existingId?: string) => Promise<void>;
  archiveQuest: (id: string) => Promise<void>;
  restoreQuest: (id: string) => Promise<void>;
  deleteQuest: (id: string) => Promise<void>;
  /** Non-blocking device reminder warning after a successful DB mutation. */
  reminderWarning: string | null;
  /** Retry reminder reconciliation without opening an OS permission prompt. */
  retryReminders: () => Promise<void>;
  /** R-33: toggle one stage's done state. */
  toggleStage: (lqId: string, stageId: string) => void;
  longQuestsLoading: boolean;
  longQuestsError: string | null;
  /** Re-fetch Long Quests after a load failure. */
  retryLongQuests: () => Promise<void>;
  /** R-32: create or edit a Long Quest with ordered stages. */
  saveLongQuest: (input: LongQuestInput, existingId?: string) => Promise<void>;
  removeLongQuest: (id: string) => Promise<void>;
  /** R-42: global reminder toggle. */
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  /** R-30/R-31: this week's auto-generated quest, null until the first load resolves. */
  weeklyQuest: WeeklyQuest | null;
  saveProfile: (input: { displayName: string; userClass: string }) => Promise<void>;
}

const EiyuContext = createContext<EiyuStore | null>(null);

export function EiyuProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const qc = useQueryClient();

  const [darkMode, setDarkMode] = useState(true);
  const [questActionError, setQuestActionError] = useState<string | null>(null);
  const [retryingQuests, setRetryingQuests] = useState(false);
  const [retryingLongQuests, setRetryingLongQuests] = useState(false);
  const [lqActionError, setLqActionError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [notificationPreferenceLoaded, setNotificationPreferenceLoaded] = useState(false);
  const [reminderWarning, setReminderWarning] = useState<string | null>(null);
  const reminderOperation = useRef(0);
  const preferenceOperation = useRef(0);
  const preferenceWriteQueue = useRef<Promise<unknown>>(Promise.resolve());
  const preferenceReadFailed = useRef(false);
  const reminderTaskQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [accountDayRevision, setAccountDayRevision] = useState(0);
  const lifecycleRequests = useRef(new Map<string, Promise<void>>());
  const deletedHabitIds = useRef(new Set<string>());
  const explicitPermissionRequest = useRef(false);
  const activeUserId = useRef(userId);

  const habitsQuery = useQuery({
    queryKey: habitsTodayKey(userId),
    queryFn: () => fetchTodayHabits(userId!),
    enabled: !!userId,
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
  // Depends on fresh stats (fetch-or-create writes a row server-side).
  const weeklyQuestQuery = useQuery({
    queryKey: ['weeklyQuest', userId ?? null],
    // Self-fetches stats so create-or-fetch can never seed against stale data
    // even when invalidations below are dispatched in parallel.
    queryFn: async () =>
      fetchOrCreateWeeklyQuest(
        userId!,
        await fetchStats(userId!),
        profileQuery.data!.timeZone
      ),
    enabled: !!userId && !!profileQuery.data,
  });
  const longQuestsQuery = useQuery({
    queryKey: longQuestsKey(userId),
    queryFn: () => fetchLongQuests(userId!),
    enabled: !!userId,
  });

  const quests = useMemo(() => habitsQuery.data ?? [], [habitsQuery.data]);
  const longQuests = useMemo(() => longQuestsQuery.data ?? [], [longQuestsQuery.data]);
  const stats = useMemo(() => statsQuery.data ?? initialUser.stats, [statsQuery.data]);
  const profile = profileQuery.data ?? null;
  const weeklyQuest = weeklyQuestQuery.data ?? null;

  useEffect(() => {
    if (!userId || !profile?.timeZone) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNextRollover = () => {
      const delay = millisecondsUntilNextAccountDay(new Date(), profile.timeZone) + 50;
      timer = setTimeout(() => {
        if (!active) return;
        Promise.all([
          qc.invalidateQueries({ queryKey: habitsTodayKey(userId) }),
          qc.invalidateQueries({ queryKey: ['weeklyQuest', userId] }),
        ]).finally(() => {
          setAccountDayRevision(revision => revision + 1);
          scheduleNextRollover();
        });
      }, delay);
    };
    scheduleNextRollover();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [profile?.timeZone, qc, userId]);

  // A failure in ANY load query must reach the same error+retry UI - deriving
  // from habitsQuery alone silently dropped profile/stats/weekly failures.
  // While a retry is in flight, hide the stale error and show loading -
  // otherwise there is zero visual difference between idle-error and retry.
  const questsLoadError = retryingQuests
    ? undefined
    : [
    habitsQuery.error,
    profileQuery.error,
    statsQuery.error,
    weeklyQuestQuery.error,
  ].find((e): e is Error => !!e);
  const questsError = questsLoadError ? formatError(questsLoadError) : questActionError;
  const longQuestsError = longQuestsQuery.isPending || retryingLongQuests ? null : longQuestsQuery.error ? formatError(longQuestsQuery.error) : lqActionError;

  // Sign-out/account-switch hygiene: no user-scoped query or persisted cache
  // entry may survive into another account's board.
  useEffect(() => {
    const previousUserId = activeUserId.current;
    if (previousUserId && previousUserId !== userId) {
      qc.removeQueries({ predicate: query => query.queryKey.includes(previousUserId) });
    }
    if (!userId) qc.removeQueries();
    activeUserId.current = userId;
    deletedHabitIds.current.clear();
    lifecycleRequests.current.clear();
    setReminderWarning(null);
  }, [qc, userId]);
  // Frozen-recovery notifications (R-41): notify only on the transition into
  // frozen while the app is open. The first observed snapshot of a session -
  // including one restored from the persisted cache - is seeded silently.
  const previouslyFrozenIds = useRef<Set<string>>(new Set());
  const frozenSeeded = useRef(false);

  useEffect(() => {
    previouslyFrozenIds.current = new Set();
    frozenSeeded.current = false;
  }, [userId]);

  useEffect(() => {
    if (!habitsQuery.data) return;
    const newlyFrozen = habitsQuery.data.filter(
      h => h.frozen && !previouslyFrozenIds.current.has(h.id)
    );
    previouslyFrozenIds.current = new Set(habitsQuery.data.filter(h => h.frozen).map(h => h.id));
    if (!frozenSeeded.current) {
      frozenSeeded.current = true;
      return;
    }
    if (notificationsEnabled) {
      newlyFrozen.forEach(h => {
        notifyRecoveryQuestGenerated(h.name).catch(() => {});
      });
    }
  }, [habitsQuery.data, notificationsEnabled]);

  const runReminderTask = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const queued = reminderTaskQueue.current.then(task, task);
    reminderTaskQueue.current = queued.catch(() => {});
    return queued;
  }, []);

  const syncAllReminders = useCallback(
    (enabled: boolean, requestPermission = false) => runReminderTask(async () => {
      if (!userId) return;
      if (!enabled) {
        await cancelAllHabitReminders();
        return;
      }
      // Android requires its notification channel before the permission
      // request. This is also harmless on iOS/web and keeps explicit opt-in
      // aligned with Expo SDK 54's setup order.
      await ensureNotificationSetup();
      const granted = requestPermission
        ? await requestNotificationPermissions()
        : await inspectNotificationPermissions();
      // Reconciliation always clears stale OS IDs first. An interrupted
      // archive/delete cleanup or an older sync can otherwise leave a removed
      // definition scheduled forever, and a Retry would hide that failure.
      await cancelAllHabitReminders();
      if (!granted) throw new Error('Notification permission is unavailable on this device.');
      const accountTimeZone = profile?.timeZone ?? deviceTimeZone();
      const habits = await fetchAllActiveHabits(userId);
      await Promise.all(habits.map(h => scheduleHabitReminders(h.id, h, accountTimeZone)));
      // Re-arm upcoming one-time quests, including future dates. The full
      // reset would otherwise erase their existing one-shot reminders.
      const oneTimeUpcoming = await fetchUpcomingOneTimeHabits(userId);
      await Promise.all(
        oneTimeUpcoming.map(h =>
          scheduleOneTimeReminder(h.id, h, accountTimeZone)
        )
      );
    }),
    [userId, profile?.timeZone, runReminderTask]
  );

  useEffect(() => {
    let active = true;
    getNotificationsEnabled().then(enabled => {
      if (!active) return;
      preferenceReadFailed.current = false;
      setNotificationsEnabledState(enabled);
      setNotificationPreferenceLoaded(true);
    }).catch(err => {
      if (!active) return;
      preferenceReadFailed.current = true;
      // Default to the safe existing behavior, but make the unavailable
      // preference visible and allow reconciliation to continue.
      setNotificationsEnabledState(true);
      setReminderWarning(`Reminder preference could not be read: ${formatError(err)}`);
      setNotificationPreferenceLoaded(true);
    });
    return () => { active = false; };
  }, []);

  const retryReminders = useCallback(async () => {
    if (!userId || !notificationPreferenceLoaded) return;
    const operation = ++reminderOperation.current;
    setReminderWarning(null);
    let readingPreference = reminderWarning?.startsWith('Reminder preference') ?? false;
    try {
      // A failed preference read/write needs its own reconciliation before
      // scheduling. Otherwise Retry could hide the warning while storage still
      // disagrees with the displayed toggle.
      const enabled = readingPreference
        ? await getNotificationsEnabled()
        : notificationsEnabled;
      preferenceReadFailed.current = false;
      readingPreference = false;
      if (enabled !== notificationsEnabled) setNotificationsEnabledState(enabled);
      await syncAllReminders(enabled, false);
      if (reminderOperation.current === operation) setReminderWarning(null);
    } catch (err) {
      if (reminderOperation.current === operation) {
        const prefix = readingPreference
          ? 'Reminder preference could not be read'
          : 'Reminders could not be updated';
        setReminderWarning(`${prefix}: ${formatError(err)}`);
      }
    }
  }, [userId, notificationPreferenceLoaded, notificationsEnabled, reminderWarning, syncAllReminders]);

  useEffect(() => {
    if (!userId || !notificationPreferenceLoaded || preferenceReadFailed.current) return;
    const shouldRequestPermission = explicitPermissionRequest.current;
    explicitPermissionRequest.current = false;
    void (async () => {
      const operation = ++reminderOperation.current;
      setReminderWarning(null);
      try {
        await syncAllReminders(notificationsEnabled, shouldRequestPermission);
        if (reminderOperation.current === operation) setReminderWarning(null);
      } catch (err) {
        if (reminderOperation.current === operation) {
          setReminderWarning(`Reminders could not be updated: ${formatError(err)}`);
        }
      }
    })();
  }, [userId, notificationsEnabled, notificationPreferenceLoaded, syncAllReminders, accountDayRevision]);

  const setNotificationsEnabled = useCallback((enabled: boolean) => {
    const operation = ++preferenceOperation.current;
    setReminderWarning(null);
    // Commit device preference before changing the visible toggle or asking
    // for OS permission. Serialize rapid toggles so the newest value wins.
    const write = preferenceWriteQueue.current.then(() => persistNotificationsEnabled(enabled));
    preferenceWriteQueue.current = write.catch(() => {});
    void write.then(() => {
      if (preferenceOperation.current !== operation) return;
      if (enabled && !notificationsEnabled) explicitPermissionRequest.current = true;
      setNotificationsEnabledState(enabled);
    }).catch(err => {
      if (preferenceOperation.current === operation) {
        setReminderWarning(`Reminder preference could not be saved: ${formatError(err)}`);
      }
    });
  }, [notificationsEnabled]);

  /** Optimistic completion with rollback (same semantics as the pre-Phase-3 store). */
  const runCompletion = useCallback(
    async (id: string, action: () => Promise<void>, optimisticCompleted: boolean) => {
      if (!userId) return;
      const key = habitsTodayKey(userId);
      qc.setQueryData<Quest[]>(key, qs =>
        qs?.map(q => (q.id === id ? { ...q, completed: optimisticCompleted } : q))
      );
      try {
        await action();
        // Recompute streaks/XP/weekly progress from fresh server state.
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['stats', userId] }),
          qc.invalidateQueries({ queryKey: key }),
          qc.invalidateQueries({ queryKey: ['weeklyQuest', userId] }),
        ]);
        setQuestActionError(null);
      } catch (err) {
        qc.setQueryData<Quest[]>(key, qs =>
          qs?.map(q => (q.id === id ? { ...q, completed: !optimisticCompleted } : q))
        );
        setQuestActionError(formatError(err));
      }
    },
    [userId, qc]
  );

  const toggleQuest = useCallback(
    (id: string) => {
      const quest = quests.find(q => q.id === id);
      if (!quest || !userId) return;
      if (quest.completed) {
        void runCompletion(
          id,
          () => undoCompletion(userId, id, quest.stat, profile?.timeZone),
          false
        );
      } else {
        void runCompletion(
          id,
          () => completeHabit(userId, id, quest.stat, 'full', undefined, profile?.timeZone),
          true
        );
      }
    },
    [quests, userId, runCompletion, profile?.timeZone]
  );

  const completeEasy = useCallback(
    (id: string) => {
      const quest = quests.find(q => q.id === id);
      if (!quest || !userId || quest.completed || !quest.easyVersion) return;
      void runCompletion(
        id,
        () => completeHabit(userId, id, quest.stat, 'easy', undefined, profile?.timeZone),
        true
      );
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
        delta
      )
        .then(async serverCount => {
          qc.setQueryData<Quest[]>(key, qs =>
            qs?.map(q => (q.id === id ? { ...q, progressCount: serverCount, completed: serverCount >= target } : q))
          );
          await Promise.all([
            qc.invalidateQueries({ queryKey: ['stats', userId] }),
            qc.invalidateQueries({ queryKey: ['weeklyQuest', userId] }),
          ]);
          setQuestActionError(null);
        })
        .catch(err => {
          qc.setQueryData<Quest[]>(key, qs =>
            qs?.map(q => (q.id === id ? { ...q, progressCount: prevProgress, completed: prevCompleted } : q))
          );
          setQuestActionError(formatError(err));
        });
    },
    [quests, userId, qc, profile?.timeZone]
  );

  const completeRecovery = useCallback(
    async (id: string) => {
      const quest = quests.find(q => q.id === id);
      if (!quest || !userId || !quest.frozen) return;
      try {
        await completeHabitRecovery(id);
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['stats', userId] }),
          qc.invalidateQueries({ queryKey: habitsTodayKey(userId) }),
          qc.invalidateQueries({ queryKey: ['weeklyQuest', userId] }),
        ]);
        setQuestActionError(null);
      } catch (err) {
        setQuestActionError(formatError(err));
      }
    },
    [quests, userId, qc]
  );

  const saveHabit = useCallback(
    async (input: HabitInput, existingId?: string) => {
      if (!userId) return;
      if (existingId && deletedHabitIds.current.has(existingId)) {
        throw new Error('This quest was deleted. Close this editor and reload the board.');
      }
      if (existingId) {
        await updateHabit(existingId, input);
      } else {
        await createHabit(userId, input);
      }
      await qc.invalidateQueries({ queryKey: ['habits'] });
      setQuestActionError(null);
      if (!notificationsEnabled) return;
      const reminderOperationId = ++reminderOperation.current;
      setReminderWarning(null);
      const reminderFailure = (err: unknown) => {
        if (reminderOperation.current === reminderOperationId) {
          setReminderWarning(`Quest saved, but reminders could not be updated: ${formatError(err)}`);
        }
      };
      void syncAllReminders(true).catch(reminderFailure);
    },
    [userId, qc, notificationsEnabled, syncAllReminders]
  );

  const runLifecycle = useCallback(
    (id: string, operation: 'archive' | 'restore' | 'delete'): Promise<void> => {
      const existing = lifecycleRequests.current.get(id);
      if (existing) return existing;

      const request = (async () => {
        const reminderOperationId = ++reminderOperation.current;
        setReminderWarning(null);
        try {
          if (operation === 'archive') await archiveHabit(id);
          if (operation === 'restore') await restoreHabit(id);
          if (operation === 'delete') await deleteHabit(id);
        } catch (err) {
          setQuestActionError(formatError(err));
          throw err;
        }

        if (operation === 'delete') {
          deletedHabitIds.current.add(id);
          qc.setQueriesData<Quest[]>({ queryKey: ['habits'] }, rows =>
            rows?.filter(row => row.id !== id)
          );
        }
        await qc.invalidateQueries({ queryKey: ['habits'] });
        setQuestActionError(null);

        // Database success is authoritative. Notification cleanup/rearming is
        // deliberately best-effort and reported separately, so a permission
        // or OS scheduling failure never tells the user the DB action failed.
        try {
          await syncAllReminders(notificationsEnabled);
        } catch (err) {
          if (reminderOperation.current === reminderOperationId) {
            setReminderWarning(`Quest ${operation}d, but reminders could not be updated: ${formatError(err)}`);
          }
        }
      })();

      lifecycleRequests.current.set(id, request);
      request.then(
        () => lifecycleRequests.current.delete(id),
        () => lifecycleRequests.current.delete(id)
      );
      return request;
    },
    [notificationsEnabled, qc, syncAllReminders]
  );

  const archiveQuest = useCallback((id: string) => runLifecycle(id, 'archive'), [runLifecycle]);
  const restoreQuest = useCallback((id: string) => runLifecycle(id, 'restore'), [runLifecycle]);
  const deleteQuest = useCallback((id: string) => runLifecycle(id, 'delete'), [runLifecycle]);

  const retryQuests = useCallback(async () => {
    setQuestActionError(null);
    // Retry EVERY load query - any of them may be the failed one.
    setRetryingQuests(true);
    await Promise.all([
      qc.refetchQueries({ queryKey: habitsTodayKey(userId), type: 'active' }),
      qc.refetchQueries({ queryKey: ['profile', userId], type: 'active' }),
      qc.refetchQueries({ queryKey: ['stats', userId], type: 'active' }),
      qc.refetchQueries({ queryKey: ['weeklyQuest', userId], type: 'active' }),
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
      if (!stage || !userId) return;
      const nextDone = !stage.done;
      const key = longQuestsKey(userId);
      const previous = qc.getQueryData<LongQuest[]>(key);
      qc.setQueryData<LongQuest[]>(key, lqs =>
        lqs?.map(q =>
          q.id === lqId
            ? { ...q, stages: q.stages.map(s => (s.id === stageId ? { ...s, done: nextDone } : s)) }
            : q
        )
      );
      try {
        await setStageDone(stageId, nextDone);
        setLqActionError(null);
      } catch (err) {
        qc.setQueryData<LongQuest[]>(key, previous);
        setLqActionError(formatError(err));
      } finally {
        await qc.invalidateQueries({ queryKey: key });
      }
    },
    [longQuests, userId, qc]
  );

  const saveLongQuest = useCallback(
    async (input: LongQuestInput, existingId?: string) => {
      if (!userId) return;
      if (existingId) {
        await updateLongQuest(existingId, { name: input.name, stat: input.stat, description: input.description });
        await reconcileLongQuestStages(existingId, input.stages);
      } else {
        await createLongQuest(userId, input);
      }
      await qc.invalidateQueries({ queryKey: longQuestsKey(userId) });
      setLqActionError(null);
    },
    [userId, qc]
  );

  const removeLongQuest = useCallback(
    async (id: string) => {
      await deleteLongQuest(id);
      await qc.invalidateQueries({ queryKey: longQuestsKey(userId) });
      setLqActionError(null);
    },
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
      theme: darkMode ? darkTheme : lightTheme,
      darkMode,
      setDarkMode,
      // Gate the board until ALL load queries settle - matching the pre-Phase-3
      // Promise.all behavior. Otherwise habits can resolve first and flash the
      // placeholder stats/name from initialUser for a moment.
      questsLoading:
        habitsQuery.isPending ||
        profileQuery.isPending ||
        statsQuery.isPending ||
        weeklyQuestQuery.isPending ||
        retryingQuests,
      retryingLongQuests,
      questsError,
      retryQuests,
      toggleQuest,
      completeEasy,
      adjustProgress,
      completeRecovery,
      saveHabit,
      archiveQuest,
      restoreQuest,
      deleteQuest,
      reminderWarning,
      retryReminders,
      toggleStage,
      longQuestsLoading: longQuestsQuery.isPending || retryingLongQuests,
      longQuestsError,
      retryLongQuests,
      saveLongQuest,
      removeLongQuest,
      notificationsEnabled,
      setNotificationsEnabled,
      weeklyQuest,
      saveProfile,
    }),
    [
      user,
      darkMode,
      habitsQuery.isPending,
      profileQuery.isPending,
      statsQuery.isPending,
      weeklyQuestQuery.isPending,
      retryingQuests,
      retryingLongQuests,
      questsError,
      retryQuests,
      toggleQuest,
      completeEasy,
      adjustProgress,
      completeRecovery,
      saveHabit,
      archiveQuest,
      restoreQuest,
      deleteQuest,
      reminderWarning,
      retryReminders,
      toggleStage,
      longQuestsQuery.isPending,
      longQuestsError,
      retryLongQuests,
      saveLongQuest,
      removeLongQuest,
      notificationsEnabled,
      setNotificationsEnabled,
      weeklyQuest,
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
