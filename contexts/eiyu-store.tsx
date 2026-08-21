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
  fetchTodayHabits,
  HabitInput,
  updateHabit,
} from '@/lib/habits';
import { getNotificationsEnabled, setNotificationsEnabled as persistNotificationsEnabled } from '@/lib/notification-prefs';
import {
  cancelAllHabitReminders,
  cancelHabitReminders,
  ensureNotificationSetup,
  notifyRecoveryQuestGenerated,
  requestNotificationPermissions,
  scheduleHabitReminders,
} from '@/lib/notifications';
import { fetchProfile, ProfileData } from '@/lib/profile';
import { fetchStats } from '@/lib/stats';
import { Quest, Stat, StatData, UserProfile } from '@/types/eiyu';

interface EiyuStore {
  user: UserProfile;
  theme: EiyuTheme;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  questsLoading: boolean;
  questsError: string | null;
  /** Full completion if not yet done, undo if already done (R-05, R-07). */
  toggleQuest: (id: string) => void;
  /** Easy/recovery-version completion (R-06). */
  completeEasy: (id: string) => void;
  /** R-13: complete the frozen recovery quest, backdated to the missed day. */
  completeRecovery: (id: string) => void;
  saveHabit: (input: HabitInput, existingId?: string) => Promise<void>;
  archiveQuest: (id: string) => Promise<void>;
  toggleStage: (lqId: string, idx: number) => void;
  /** R-42: global reminder toggle. */
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
}

const EiyuContext = createContext<EiyuStore | null>(null);

export function EiyuProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [darkMode, setDarkMode] = useState(true);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [stats, setStats] = useState<Record<Stat, StatData>>(initialUser.stats);
  const [questsLoading, setQuestsLoading] = useState(false);
  const [questsError, setQuestsError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  // Long Quests are wired in Phase 10 — mock until then.
  const [longQuests, setLongQuests] = useState(initialUser.longQuests);
  // Tracks which quests were frozen as of the previous fetch, so we only
  // notify (R-41) on the transition into frozen, not on every refetch.
  const previouslyFrozenIds = useRef<Set<string>>(new Set());

  const refreshQuests = useCallback(async () => {
    if (!userId) return;
    const habits = await fetchTodayHabits(userId);
    const newlyFrozen = habits.filter(h => h.frozen && !previouslyFrozenIds.current.has(h.id));
    previouslyFrozenIds.current = new Set(habits.filter(h => h.frozen).map(h => h.id));
    setQuests(habits);
    if (notificationsEnabled) {
      newlyFrozen.forEach(h => {
        notifyRecoveryQuestGenerated(h.name).catch(() => {});
      });
    }
  }, [userId, notificationsEnabled]);

  const refreshStats = useCallback(async () => {
    if (!userId) return;
    const s = await fetchStats(userId);
    setStats(s);
  }, [userId]);

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
    },
    [userId]
  );

  useEffect(() => {
    getNotificationsEnabled().then(setNotificationsEnabledState);
  }, []);

  useEffect(() => {
    if (!userId) {
      setQuests([]);
      setProfile(null);
      setStats(initialUser.stats);
      previouslyFrozenIds.current = new Set();
      return;
    }
    let cancelled = false;
    setQuestsLoading(true);
    setQuestsError(null);
    Promise.all([fetchTodayHabits(userId), fetchProfile(userId), fetchStats(userId)])
      .then(([habits, prof, s]) => {
        if (cancelled) return;
        // seed (not notify) on cold load — we only want to notify on
        // transitions detected while the app is open, not for freezes that
        // already existed before this session started.
        previouslyFrozenIds.current = new Set(habits.filter(h => h.frozen).map(h => h.id));
        setQuests(habits);
        setProfile(prof);
        setStats(s);
      })
      .catch(err => {
        if (!cancelled) setQuestsError(formatError(err));
      })
      .finally(() => {
        if (!cancelled) setQuestsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    syncAllReminders(notificationsEnabled).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, notificationsEnabled]);

  const setNotificationsEnabled = (enabled: boolean) => {
    setNotificationsEnabledState(enabled);
    persistNotificationsEnabled(enabled).catch(() => {});
  };

  const runCompletion = async (id: string, action: () => Promise<void>, optimisticCompleted: boolean) => {
    if (!userId) return;
    const quest = quests.find(q => q.id === id);
    if (!quest) return;

    setQuests(qs => qs.map(q => (q.id === id ? { ...q, completed: optimisticCompleted } : q)));
    try {
      await action();
      // refreshQuests recomputes streak from the new completion history, not just completed-state.
      await Promise.all([refreshStats(), refreshQuests()]);
    } catch (err) {
      setQuests(qs => qs.map(q => (q.id === id ? { ...q, completed: !optimisticCompleted } : q)));
      setQuestsError(formatError(err));
    }
  };

  const toggleQuest = (id: string) => {
    const quest = quests.find(q => q.id === id);
    if (!quest || !userId) return;
    if (quest.completed) {
      runCompletion(id, () => undoCompletion(userId, id, quest.stat), false);
    } else {
      runCompletion(id, () => completeHabit(userId, id, quest.stat, 'full'), true);
    }
  };

  const completeEasy = (id: string) => {
    const quest = quests.find(q => q.id === id);
    if (!quest || !userId || quest.completed) return;
    runCompletion(id, () => completeHabit(userId, id, quest.stat, 'easy'), true);
  };

  const completeRecovery = async (id: string) => {
    const quest = quests.find(q => q.id === id);
    if (!quest || !userId || !quest.frozen || !quest.frozenDate) return;
    try {
      await completeHabit(userId, id, quest.stat, 'easy', quest.frozenDate);
      await Promise.all([refreshStats(), refreshQuests()]);
    } catch (err) {
      setQuestsError(formatError(err));
    }
  };

  const saveHabit = async (input: HabitInput, existingId?: string) => {
    if (!userId) return;
    let id: string;
    if (existingId) {
      await updateHabit(existingId, input);
      id = existingId;
    } else {
      id = await createHabit(userId, input);
    }
    await refreshQuests();
    if (notificationsEnabled) {
      scheduleHabitReminders(id, input).catch(() => {});
    }
  };

  const archiveQuest = async (id: string) => {
    await archiveHabit(id);
    await refreshQuests();
    cancelHabitReminders(id).catch(() => {});
  };

  const toggleStage = (lqId: string, idx: number) => {
    setLongQuests(lqs =>
      lqs.map(lq =>
        lq.id === lqId
          ? { ...lq, stages: lq.stages.map((s, i) => (i === idx ? { ...s, done: !s.done } : s)) }
          : lq
      )
    );
  };

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
      questsLoading,
      questsError,
      toggleQuest,
      completeEasy,
      completeRecovery,
      saveHabit,
      archiveQuest,
      toggleStage,
      notificationsEnabled,
      setNotificationsEnabled,
    }),
    [user, darkMode, questsLoading, questsError, quests, userId, notificationsEnabled]
  );

  return <EiyuContext.Provider value={value}>{children}</EiyuContext.Provider>;
}

export function useEiyu() {
  const ctx = useContext(EiyuContext);
  if (!ctx) throw new Error('useEiyu must be used within EiyuProvider');
  return ctx;
}
