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

import { initialUser } from '@/constants/eiyu-data';
import { darkTheme, lightTheme, type EiyuTheme } from '@/constants/eiyu-theme';
import { useAuth } from '@/contexts/auth-store';
import { completeHabit, undoCompletion } from '@/lib/completions';
import { rankFromStats } from '@/lib/eiyu-logic';
import { formatError } from '@/lib/format-error';
import {
  archiveHabit,
  createHabit,
  fetchAllActiveHabits,
  fetchTodayOneTimeHabits,
  fetchTodayHabits,
  HabitInput,
  updateHabit,
} from '@/lib/habits';
import {
  getNotificationsEnabled,
  setNotificationsEnabled as persistNotificationsEnabled,
} from '@/lib/notification-prefs';
import {
  cancelAllHabitReminders,
  cancelHabitReminders,
  ensureNotificationSetup,
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
  setStageDone,
} from '@/lib/long-quests';
import { fetchProfile } from '@/lib/profile';
import { fetchStats } from '@/lib/stats';
import { fetchOrCreateWeeklyQuest, WeeklyQuest } from '@/lib/weekly-quest';
import { LongQuest, Quest, UserProfile } from '@/types/eiyu';

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
  /** R-13: complete the frozen recovery quest, backdated to the missed day. */
  completeRecovery: (id: string) => void;
  saveHabit: (input: HabitInput, existingId?: string) => Promise<void>;
  archiveQuest: (id: string) => Promise<void>;
  /** R-33: toggle one stage's done state. */
  toggleStage: (lqId: string, stageId: string) => void;
  longQuestsLoading: boolean;
  longQuestsError: string | null;
  /** Re-fetch Long Quests after a load failure. */
  retryLongQuests: () => Promise<void>;
  /** R-32: create a Long Quest with ordered stages. */
  saveLongQuest: (input: LongQuestInput) => Promise<void>;
  removeLongQuest: (id: string) => Promise<void>;
  /** R-42: global reminder toggle. */
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  /** R-30/R-31: this week's auto-generated quest, null until the first load resolves. */
  weeklyQuest: WeeklyQuest | null;
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
    queryFn: async () => fetchOrCreateWeeklyQuest(userId!, await fetchStats(userId!)),
    enabled: !!userId,
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

  // Sign-out hygiene: nothing user-scoped should survive into another account.
  useEffect(() => {
    if (!userId) qc.removeQueries();
  }, [userId, qc]);
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

  const syncAllReminders = useCallback(
    async (enabled: boolean) => {
      if (!userId) return;
      if (!enabled) {
        await cancelAllHabitReminders();
        return;
      }
      const granted = await requestNotificationPermissions();
      if (!granted) return;
      await ensureNotificationSetup();
      const habits = await fetchAllActiveHabits(userId);
      await Promise.all(habits.map(h => scheduleHabitReminders(h.id, h)));
      // Re-arm today's one-time reminders too - cancelAllHabitReminders wiped
      // their ids from the shared map, and the recurring resync above excludes
      // them by design. scheduleOneTimeReminder no-ops for past times.
      const oneTimeToday = await fetchTodayOneTimeHabits(userId);
      await Promise.all(oneTimeToday.map(h => scheduleOneTimeReminder(h.id, h)));
    },
    [userId]
  );

  useEffect(() => {
    getNotificationsEnabled().then(setNotificationsEnabledState);
  }, []);

  useEffect(() => {
    if (!userId) return;
    syncAllReminders(notificationsEnabled).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, notificationsEnabled]);

  const setNotificationsEnabled = useCallback((enabled: boolean) => {
    setNotificationsEnabledState(enabled);
    persistNotificationsEnabled(enabled).catch(() => {});
  }, []);

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
        void runCompletion(id, () => undoCompletion(userId, id, quest.stat), false);
      } else {
        void runCompletion(id, () => completeHabit(userId, id, quest.stat, 'full'), true);
      }
    },
    [quests, userId, runCompletion]
  );

  const completeEasy = useCallback(
    (id: string) => {
      const quest = quests.find(q => q.id === id);
      if (!quest || !userId || quest.completed || !quest.easyVersion) return;
      void runCompletion(id, () => completeHabit(userId, id, quest.stat, 'easy'), true);
    },
    [quests, userId, runCompletion]
  );

  const completeRecovery = useCallback(
    async (id: string) => {
      const quest = quests.find(q => q.id === id);
      if (!quest || !userId || !quest.frozen || !quest.frozenDate) return;
      try {
        await completeHabit(userId, id, quest.stat, 'easy', quest.frozenDate);
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
      let id: string;
      if (existingId) {
        await updateHabit(existingId, input);
        id = existingId;
      } else {
        id = await createHabit(userId, input);
      }
      await qc.invalidateQueries({ queryKey: ['habits'] });
      setQuestActionError(null);
      if (!notificationsEnabled) return;
      if (input.questType === 'one_time') {
        // True one-shot DATE trigger for today; no-ops if the time passed.
        scheduleOneTimeReminder(id, { name: input.name, time: input.time }).catch(() => {});
      } else {
        scheduleHabitReminders(id, input).catch(() => {});
      }
    },
    [userId, qc, notificationsEnabled]
  );

  const archiveQuest = useCallback(
    async (id: string) => {
      await archiveHabit(id);
      await qc.invalidateQueries({ queryKey: ['habits'] });
      setQuestActionError(null);
      cancelHabitReminders(id).catch(() => {});
    },
    [qc]
  );

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
        qc.setQueryData<LongQuest[]>(key, lqs =>
          lqs?.map(q =>
            q.id === lqId
              ? { ...q, stages: q.stages.map(s => (s.id === stageId ? { ...s, done: !nextDone } : s)) }
              : q
          )
        );
        setLqActionError(formatError(err));
      }
    },
    [longQuests, userId, qc]
  );

  const saveLongQuest = useCallback(
    async (input: LongQuestInput) => {
      if (!userId) return;
      await createLongQuest(userId, input);
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

  const user: UserProfile = useMemo(
    () => ({
      name: profile?.displayName ?? initialUser.name,
      userClass: profile?.userClass ?? initialUser.userClass,
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
      completeRecovery,
      saveHabit,
      archiveQuest,
      toggleStage,
      longQuestsLoading: longQuestsQuery.isPending || retryingLongQuests,
      longQuestsError,
      retryLongQuests,
      saveLongQuest,
      removeLongQuest,
      notificationsEnabled,
      setNotificationsEnabled,
      weeklyQuest,
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
      completeRecovery,
      saveHabit,
      archiveQuest,
      toggleStage,
      longQuestsQuery.isPending,
      longQuestsError,
      retryLongQuests,
      saveLongQuest,
      removeLongQuest,
      notificationsEnabled,
      setNotificationsEnabled,
      weeklyQuest,
    ]
  );

  return <EiyuContext.Provider value={value}>{children}</EiyuContext.Provider>;
}

export function useEiyu() {
  const ctx = useContext(EiyuContext);
  if (!ctx) throw new Error('useEiyu must be used within EiyuProvider');
  return ctx;
}
