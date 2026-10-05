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
import * as Network from 'expo-network';
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
import type { EiyuTheme } from '@/constants/eiyu-theme';
import { useAuth } from '@/contexts/auth-store';
import { useAppTheme } from '@/contexts/theme-store';
import { completeHabit, completeHabitRecovery, undoCompletion, incrementHabitProgress } from '@eiyu/shared';
import { rankFromStats } from '@eiyu/shared';
import { formatError } from '@eiyu/shared';
import { accountDateKey, deviceTimeZone, millisecondsUntilNextAccountDay } from '@eiyu/shared';
import {
  archiveHabit,
  createHabit,
  deleteHabit,
  fetchAllActiveHabits,
  fetchBacklogQuests,
  fetchUpcomingOneTimeHabits,
  fetchTodayHabits,
  HabitInput,
  moveBacklogToOneTime,
  moveOneTimeToBacklog,
  restoreHabit,
  updateHabit,
} from '@eiyu/shared';
import {
  getNotificationsEnabled,
  setNotificationsEnabled as persistNotificationsEnabled,
} from '@/lib/notification-prefs';
import { getSoundEffectsEnabled, setSoundEffectsEnabled as persistSoundEffectsEnabled } from '@/lib/sound-effects-prefs';
import { useCompletionSound } from '@/lib/completion-sound';
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
  deleteLongQuest,
  fetchLongQuests,
  LongQuestInput,
  saveAtomicLongQuest,
  setStageDoneWithReceipt,
  stageNotice,
  type RewardReceipt,
} from '@eiyu/shared';
import { newRequestId } from '@/lib/request-id';
import { fetchProfile, updateProfile } from '@eiyu/shared';
import { fetchStats } from '@eiyu/shared';
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
const backlogKey = (userId?: string) => ['backlog', userId ?? null] as const;

/**
 * The refresh when the account's day changes: the board first, because reading it runs the server rollover that moves
 * unfinished one-time quests into Backlog; Backlog after it.
 */
export async function invalidateForNewDay(qc: QueryClient, userId: string): Promise<void> {
  await qc.invalidateQueries({ queryKey: habitsTodayKey(userId) }).then(() => qc.invalidateQueries({ queryKey: backlogKey(userId) }));
}

function isOfflineNetworkFailure(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : String(error);
  return /network request failed|failed to fetch|networkerror|load failed/i.test(message);
}

function formatQuestActionError(error: unknown): string {
  return isOfflineNetworkFailure(error)
    ? "You're offline. Your update wasn't saved. Your saved quests are still shown."
    : formatError(error);
}

function formatQuestLoadError(error: unknown, hasCachedData: boolean): string {
  return isOfflineNetworkFailure(error)
    ? hasCachedData
      ? "You're offline. Your saved quests are still shown. Check your connection or retry."
      : "You're offline. Your quests couldn't be loaded. Check your connection or retry."
    : formatError(error);
}
const offlineActionMessage = "You're offline. Your update wasn't saved. Your saved quests are still shown.";

interface EiyuStore {
  user: UserProfile;
  theme: EiyuTheme;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  questsLoading: boolean;
  questsError: string | null;
  /** True when a previously loaded quest list is available, including an empty list. */
  questsHaveCachedData: boolean;
  /** Re-fetch today's quests after a load failure (e.g. a transient network/auth error). */
  retryQuests: () => Promise<void>;
  /** Full completion if not yet done, undo if already done (R-05, R-07). */
  toggleQuest: (id: string) => void;
  /** Slice 5: adjust a quantity habit's today progress by delta, clamped server-side. */
  adjustProgress: (id: string, delta: number) => void;
  /** R-13: ask the server to resolve the authoritative open recovery window. */
  completeRecovery: (id: string) => void;
  saveHabit: (input: HabitInput, existingId?: string) => Promise<void>;
  archiveQuest: (id: string) => Promise<void>;
  restoreQuest: (id: string) => Promise<void>;
  deleteQuest: (id: string) => Promise<void>;
  /** Backlog quests: ideas with no date, newest first. */
  backlog: Quest[];
  backlogLoading: boolean;
  /** Backlog to One-time (the server dates it today). */
  moveToOneTime: (id: string) => Promise<void>;
  /** One-time to Backlog (the server refuses it once the quest has a completion). */
  moveToBacklog: (id: string) => Promise<void>;
  /** Non-blocking device reminder warning after a successful DB mutation. */
  reminderWarning: string | null;
  /** Retry reminder reconciliation without opening an OS permission prompt. */
  retryReminders: () => Promise<void>;
  /** R-33: toggle one stage's done state; the reward is paid once per request id even if the call is retried. */
  toggleStage: (lqId: string, stageId: string) => void;
  /** Stages with a request in flight. */
  pendingStageIds: string[];
  /** The XP card for the last confirmed stage change (null for a replay or after it is cleared). */
  rewardReceipt: RewardReceipt | null;
  stageRewardNotice: string | null;
  clearStageReward: () => void;
  longQuestsLoading: boolean;
  longQuestsError: string | null;
  /** Re-fetch Long Quests after a load failure. */
  retryLongQuests: () => Promise<void>;
  /** R-32: create or edit a Long Quest with ordered stages. */
  saveLongQuest: (input: LongQuestInput, existingId?: string) => Promise<void>;
  /** Drop the remembered ids of an unconfirmed save so the next attempt starts fresh (after the user discards it). */
  forgetLongQuestSave: () => void;
  removeLongQuest: (id: string) => Promise<void>;
  /** R-42: global reminder toggle. */
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  soundEffectsEnabled: boolean;
  soundEffectsLoaded: boolean;
  setSoundEffectsEnabled: (enabled: boolean) => Promise<void>;
  /** R-30/R-31: this week's auto-generated quest, null until the first load resolves. */
  saveProfile: (input: { displayName: string; userClass: string }) => Promise<void>;
}

const EiyuContext = createContext<EiyuStore | null>(null);

export function EiyuProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const qc = useQueryClient();

  const { darkMode, theme: appTheme, setMode } = useAppTheme();
  const setDarkMode = useCallback((dark: boolean) => setMode(dark ? 'dark' : 'light'), [setMode]);
  const [questActionError, setQuestActionError] = useState<string | null>(null);
  const [retryingQuests, setRetryingQuests] = useState(false);
  const [retryingLongQuests, setRetryingLongQuests] = useState(false);
  const [lqActionError, setLqActionError] = useState<string | null>(null);
  const [stageRewardNotice, setStageRewardNotice] = useState<string | null>(null);
  const [rewardReceipt, setRewardReceipt] = useState<RewardReceipt | null>(null);
  const [pendingStageIds, setPendingStageIds] = useState<string[]>([]);
  const rewardRequests = useRef(new Map<string, string>());
  const definitionRequests = useRef(new Map<string, { id: string; request: string }>());
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [notificationPreferenceLoaded, setNotificationPreferenceLoaded] = useState(false);
  const [soundEffectsEnabled, setSoundEffectsEnabledState] = useState(false);
  const [soundEffectsLoaded, setSoundEffectsLoaded] = useState(false);
  const [reminderWarning, setReminderWarning] = useState<string | null>(null);
  const reminderOperation = useRef(0);
  const preferenceOperation = useRef(0);
  const preferenceWriteQueue = useRef<Promise<unknown>>(Promise.resolve());
  const preferenceReadFailed = useRef(false);
  const soundPreferenceOperation = useRef(0);
  const soundPreferenceWriteQueue = useRef<Promise<unknown>>(Promise.resolve());
  const reminderTaskQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [accountDayRevision, setAccountDayRevision] = useState(0);
  const lifecycleRequests = useRef(new Map<string, Promise<void>>());
  const deletedHabitIds = useRef(new Set<string>());
  const quantitySoundTransitions = useRef(new Set<string>());
  const explicitPermissionRequest = useRef(false);
  const activeUserId = useRef(userId);
  const offlineFailurePending = useRef(false);
  const lastConnectivity = useRef<boolean | null>(null);
  const connectivityEventRevision = useRef(0);
  const playCompletionSound = useCompletionSound();

  const trackOfflineFailure = useCallback(async <T,>(request: () => Promise<T>): Promise<T> => {
    try {
      return await request();
    } catch (error) {
      if (isOfflineNetworkFailure(error)) offlineFailurePending.current = true;
      throw error;
    }
  }, []);
  const formatTrackedQuestActionError = useCallback((error: unknown): string => {
    if (isOfflineNetworkFailure(error)) offlineFailurePending.current = true;
    return formatQuestActionError(error);
  }, []);

  useEffect(() => {
    let active = true;
    const operation = soundPreferenceOperation.current;
    void getSoundEffectsEnabled().then(enabled => {
      if (!active || soundPreferenceOperation.current !== operation) return;
      setSoundEffectsEnabledState(enabled);
      setSoundEffectsLoaded(true);
    }).catch(() => {
      if (active && soundPreferenceOperation.current === operation) setSoundEffectsLoaded(true);
    });
    return () => { active = false; };
  }, []);

  const habitsQuery = useQuery({
    queryKey: habitsTodayKey(userId),
    queryFn: () => trackOfflineFailure(() => fetchTodayHabits(userId!)),
    enabled: !!userId,
  });
  // Read Backlog only after the board read: that read runs the server rollover that can add quests to Backlog.
  const backlogQuery = useQuery({
    queryKey: backlogKey(userId),
    queryFn: () => trackOfflineFailure(() => fetchBacklogQuests(userId!)),
    enabled: !!userId && habitsQuery.isSuccess,
  });
  const profileQuery = useQuery({
    queryKey: ['profile', userId ?? null],
    queryFn: () => trackOfflineFailure(() => fetchProfile(userId!)),
    enabled: !!userId,
  });
  const statsQuery = useQuery({
    queryKey: ['stats', userId ?? null],
    queryFn: () => trackOfflineFailure(() => fetchStats(userId!)),
    enabled: !!userId,
  });
  const longQuestsQuery = useQuery({
    queryKey: longQuestsKey(userId),
    queryFn: () => trackOfflineFailure(() => fetchLongQuests(userId!)),
    enabled: !!userId,
  });

  const quests = useMemo(() => habitsQuery.data ?? [], [habitsQuery.data]);
  const backlog = useMemo(() => backlogQuery.data ?? [], [backlogQuery.data]);
  const questsHaveCachedData = habitsQuery.data !== undefined;
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
        invalidateForNewDay(qc, userId).finally(() => {
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
    backlogQuery.error,
    profileQuery.error,
    statsQuery.error,
  ].find((e): e is Error => !!e);
  const questsError = questsLoadError ? formatQuestLoadError(questsLoadError, questsHaveCachedData) : questActionError;
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

  useEffect(() => {
    offlineFailurePending.current = false;
    lastConnectivity.current = null;
    connectivityEventRevision.current += 1;
    const startingRevision = connectivityEventRevision.current;
    let active = true;
    void Network.getNetworkStateAsync().then(state => {
      if (active && connectivityEventRevision.current === startingRevision) {
        lastConnectivity.current = state.isConnected ?? null;
      }
    }).catch(() => {});
    const subscription = Network.addNetworkStateListener(state => {
      connectivityEventRevision.current += 1;
      const wasOffline = lastConnectivity.current === false;
      lastConnectivity.current = state.isConnected ?? null;
      if (!wasOffline || state.isConnected !== true || !offlineFailurePending.current || !userId) return;
      offlineFailurePending.current = false;
      const habitsRefresh = qc.invalidateQueries(
        { queryKey: habitsTodayKey(userId), refetchType: 'active' },
        { throwOnError: true }
      ).then(() => {
        if (active && activeUserId.current === userId) {
          setQuestActionError(message => message === offlineActionMessage ? null : message);
        }
      });
      return Promise.all([
        habitsRefresh,
        qc.invalidateQueries({ queryKey: backlogKey(userId), refetchType: 'active' }, { throwOnError: true }),
        qc.invalidateQueries({ queryKey: ['profile', userId], refetchType: 'active' }, { throwOnError: true }),
        qc.invalidateQueries({ queryKey: ['stats', userId], refetchType: 'active' }, { throwOnError: true }),
      ]).catch(() => {});
    });
    return () => {
      active = false;
      subscription?.remove?.();
    };
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

  const setSoundEffectsEnabled = useCallback(async (enabled: boolean) => {
    const operation = ++soundPreferenceOperation.current;
    const write = soundPreferenceWriteQueue.current.then(() => persistSoundEffectsEnabled(enabled));
    soundPreferenceWriteQueue.current = write.catch(() => {});
    await write;
    if (soundPreferenceOperation.current !== operation) return;
    setSoundEffectsEnabledState(enabled);
    setSoundEffectsLoaded(true);
  }, []);

  const playSuccessfulCompletionSound = useCallback(() => {
    if (soundEffectsEnabled) playCompletionSound();
  }, [soundEffectsEnabled, playCompletionSound]);

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
        if (optimisticCompleted) playSuccessfulCompletionSound();
        // Recompute streaks/XP/weekly progress from fresh server state.
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['stats', userId] }),
          qc.invalidateQueries({ queryKey: key }),
        ]);
        setQuestActionError(null);
      } catch (err) {
        qc.setQueryData<Quest[]>(key, qs =>
          qs?.map(q => (q.id === id ? { ...q, completed: !optimisticCompleted } : q))
        );
        setQuestActionError(formatTrackedQuestActionError(err));
      }
    },
    [userId, qc, formatTrackedQuestActionError, playSuccessfulCompletionSound]
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
          if (
            soundEffectsEnabled &&
            !quest.completed &&
            prevProgress < target &&
            serverCount >= target &&
            !quantitySoundTransitions.current.has(id)
          ) {
            quantitySoundTransitions.current.add(id);
            playSuccessfulCompletionSound();
            setTimeout(() => quantitySoundTransitions.current.delete(id), 0);
          }
          await Promise.all([
            qc.invalidateQueries({ queryKey: ['stats', userId] }),
          ]);
          setQuestActionError(null);
        })
        .catch(err => {
          qc.setQueryData<Quest[]>(key, qs =>
            qs?.map(q => (q.id === id ? { ...q, progressCount: prevProgress, completed: prevCompleted } : q))
          );
          setQuestActionError(formatTrackedQuestActionError(err));
        });
    },
    [quests, userId, qc, profile?.timeZone, formatTrackedQuestActionError, soundEffectsEnabled, playSuccessfulCompletionSound]
  );

  const completeRecovery = useCallback(
    async (id: string) => {
      const quest = quests.find(q => q.id === id);
      if (!quest || !userId || !quest.frozen) return;
      try {
        await completeHabitRecovery(id);
        playSuccessfulCompletionSound();
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['stats', userId] }),
          qc.invalidateQueries({ queryKey: habitsTodayKey(userId) }),
        ]);
        setQuestActionError(null);
      } catch (err) {
        setQuestActionError(formatTrackedQuestActionError(err));
      }
    },
    [quests, userId, qc, formatTrackedQuestActionError, playSuccessfulCompletionSound]
  );

  const saveHabit = useCallback(
    async (input: HabitInput, existingId?: string) => {
      if (!userId) return;
      if (existingId && deletedHabitIds.current.has(existingId)) {
        throw new Error('This quest was deleted. Close this editor and reload the board.');
      }
      if (existingId) {
        await updateHabit(existingId, input, quests.find(quest => quest.id === existingId)?.name);
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
    [userId, qc, quests, notificationsEnabled, syncAllReminders]
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
          setQuestActionError(formatTrackedQuestActionError(err));
          throw err;
        }

        if (operation === 'delete') {
          deletedHabitIds.current.add(id);
          qc.setQueriesData<Quest[]>({ queryKey: ['habits'] }, rows =>
            rows?.filter(row => row.id !== id)
          );
          qc.setQueriesData<Quest[]>({ queryKey: ['backlog'] }, rows =>
            rows?.filter(row => row.id !== id)
          );
        }
        await Promise.all([qc.invalidateQueries({ queryKey: ['habits'] }), qc.invalidateQueries({ queryKey: ['backlog'] })]);
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
    [notificationsEnabled, qc, syncAllReminders, formatTrackedQuestActionError]
  );

  const archiveQuest = useCallback((id: string) => runLifecycle(id, 'archive'), [runLifecycle]);
  const restoreQuest = useCallback((id: string) => runLifecycle(id, 'restore'), [runLifecycle]);
  const deleteQuest = useCallback((id: string) => runLifecycle(id, 'delete'), [runLifecycle]);

  const runMove = useCallback(
    (id: string, direction: 'to-one-time' | 'to-backlog'): Promise<void> => {
      const existing = lifecycleRequests.current.get(id);
      if (existing) return existing;

      const request = (async () => {
        const reminderOperationId = ++reminderOperation.current;
        setReminderWarning(null);
        try {
          if (direction === 'to-one-time') await moveBacklogToOneTime(id);
          else await moveOneTimeToBacklog(id);
        } catch (err) {
          setQuestActionError(formatTrackedQuestActionError(err));
          throw err;
        }

        await Promise.all([qc.invalidateQueries({ queryKey: ['habits'] }), qc.invalidateQueries({ queryKey: ['backlog'] })]);
        setQuestActionError(null);

        // A quest that left One-time must lose its reminder; like archive, this is best-effort and reported separately.
        try {
          await syncAllReminders(notificationsEnabled);
        } catch (err) {
          if (reminderOperation.current === reminderOperationId) {
            setReminderWarning(`Quest moved, but reminders could not be updated: ${formatError(err)}`);
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
    [notificationsEnabled, qc, syncAllReminders, formatTrackedQuestActionError]
  );
  const moveToOneTime = useCallback((id: string) => runMove(id, 'to-one-time'), [runMove]);
  const moveToBacklog = useCallback((id: string) => runMove(id, 'to-backlog'), [runMove]);

  const retryQuests = useCallback(async () => {
    setQuestActionError(null);
    // Retry EVERY load query - any of them may be the failed one.
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

  const stageRequests = useRef(new Set<string>());
  const toggleStage = useCallback(
    async (lqId: string, stageId: string) => {
      const lq = longQuests.find(q => q.id === lqId);
      const stage = lq?.stages.find(s => s.id === stageId);
      if (!stage || !userId || stageRequests.current.has(lqId)) return;
      stageRequests.current.add(lqId);
      const nextDone = !stage.done;
      const key = longQuestsKey(userId);
      setPendingStageIds(ids => [...ids, stageId]);
      // The same request id is reused until the server confirms, so a retry after a dropped reply cannot pay twice.
      const operation = `${stageId}:${nextDone}`;
      const requestId = rewardRequests.current.get(operation) ?? newRequestId();
      rewardRequests.current.set(operation, requestId);
      try {
        const receipt = await setStageDoneWithReceipt(stageId, nextDone, requestId);
        rewardRequests.current.delete(operation);
        qc.setQueryData<LongQuest[]>(key, lqs =>
          lqs?.map(q => q.id === lqId ? { ...q, stages: q.stages.map(s => (s.id === stageId ? { ...s, done: receipt.done } : s)) } : q)
        );
        if (activeUserId.current !== userId) return;
        setLqActionError(null);
        setRewardReceipt(receipt.replayed ? null : receipt);
        setStageRewardNotice(stageNotice(receipt.replayed ? 'replayed' : receipt.changed ? (nextDone ? 'completed' : 'undone') : 'unchanged'));
      } catch (err) {
        if (activeUserId.current === userId) {
          setLqActionError(formatError(err));
          setStageRewardNotice(null);
        }
      } finally {
        await qc.invalidateQueries({ queryKey: key });
        await qc.invalidateQueries({ queryKey: ['stats', userId] });
        stageRequests.current.delete(lqId);
        setPendingStageIds(ids => ids.filter(id => id !== stageId));
      }
    },
    [longQuests, userId, qc]
  );

  const clearStageReward = useCallback(() => {
    setRewardReceipt(null);
    setStageRewardNotice(null);
  }, []);

  const saveLongQuest = useCallback(
    async (input: LongQuestInput, existingId?: string) => {
      if (!userId) return;
      // A retry after an unconfirmed save must reuse the quest id and request id; they are dropped only on success.
      const operation = existingId ?? 'new';
      const stable = definitionRequests.current.get(operation) ?? { id: existingId ?? newRequestId(), request: newRequestId() };
      definitionRequests.current.set(operation, stable);
      await saveAtomicLongQuest(stable.id, stable.request, input, !existingId, longQuests.find(q => q.id === existingId)?.name);
      definitionRequests.current.delete(operation);
      await qc.invalidateQueries({ queryKey: longQuestsKey(userId) });
      setLqActionError(null);
    },
    [userId, qc, longQuests]
  );

  const forgetLongQuestSave = useCallback(() => { definitionRequests.current.clear(); }, []);

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
      theme: appTheme,
      darkMode,
      setDarkMode,
      // Gate the board until ALL load queries settle - matching the pre-Phase-3
      // Promise.all behavior. Otherwise habits can resolve first and flash the
      // placeholder stats/name from initialUser for a moment.
      questsLoading:
        habitsQuery.isPending ||
        profileQuery.isPending ||
        statsQuery.isPending ||
        retryingQuests,
      retryingLongQuests,
      questsError,
      questsHaveCachedData,
      retryQuests,
      toggleQuest,
      adjustProgress,
      completeRecovery,
      saveHabit,
      archiveQuest,
      restoreQuest,
      deleteQuest,
      backlog,
      backlogLoading: backlogQuery.isLoading,
      moveToOneTime,
      moveToBacklog,
      reminderWarning,
      retryReminders,
      toggleStage,
      pendingStageIds,
      rewardReceipt,
      stageRewardNotice,
      clearStageReward,
      longQuestsLoading: longQuestsQuery.isPending || retryingLongQuests,
      longQuestsError,
      retryLongQuests,
      saveLongQuest,
      forgetLongQuestSave,
      removeLongQuest,
      notificationsEnabled,
      setNotificationsEnabled,
      soundEffectsEnabled,
      soundEffectsLoaded,
      setSoundEffectsEnabled,
      saveProfile,
    }),
    [
      user,
      darkMode,
      appTheme,
      setDarkMode,
      habitsQuery.isPending,
      profileQuery.isPending,
      statsQuery.isPending,
      retryingQuests,
      retryingLongQuests,
      questsError,
      questsHaveCachedData,
      retryQuests,
      toggleQuest,
      adjustProgress,
      completeRecovery,
      saveHabit,
      archiveQuest,
      restoreQuest,
      deleteQuest,
      backlog,
      backlogQuery.isLoading,
      moveToOneTime,
      moveToBacklog,
      reminderWarning,
      retryReminders,
      toggleStage,
      pendingStageIds,
      rewardReceipt,
      stageRewardNotice,
      clearStageReward,
      longQuestsQuery.isPending,
      longQuestsError,
      retryLongQuests,
      saveLongQuest,
      forgetLongQuestSave,
      removeLongQuest,
      notificationsEnabled,
      setNotificationsEnabled,
      soundEffectsEnabled,
      soundEffectsLoaded,
      setSoundEffectsEnabled,
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
