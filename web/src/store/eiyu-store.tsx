import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  archiveHabit,
  completeHabit,
  createHabit,
  createLongQuest,
  deleteLongQuest,
  fetchLongQuests,
  fetchProfile,
  fetchStats,
  fetchTodayHabits,
  formatError,
  initialUser,
  rankFromStats,
  reconcileLongQuestStages,
  setStageDone,
  undoCompletion,
  updateHabit,
  updateLongQuest,
  type HabitInput,
  type LongQuest,
  type LongQuestInput,
  type Quest,
  type UserProfile,
} from '@eiyu/shared';

import { useSession } from './session-context';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

const habitsTodayKey = (userId?: string) => ['habits', 'today', userId ?? null] as const;
const longQuestsKey = (userId?: string) => ['longQuests', userId ?? null] as const;

interface EiyuStore {
  user: UserProfile;
  questsLoading: boolean;
  questsError: string | null;
  retryQuests: () => Promise<void>;
  /** Full completion if not yet done, undo if already done. */
  toggleQuest: (id: string) => void;
  /** Complete a frozen habit's recovery quest, backdated to the missed day. */
  completeRecovery: (id: string) => void;
  saveHabit: (input: HabitInput, existingId?: string) => Promise<void>;
  archiveQuest: (id: string) => Promise<void>;
  toggleStage: (lqId: string, stageId: string) => void;
  longQuestsLoading: boolean;
  longQuestsError: string | null;
  retryLongQuests: () => Promise<void>;
  saveLongQuest: (input: LongQuestInput, existingId?: string) => Promise<void>;
  removeLongQuest: (id: string) => Promise<void>;
}

const EiyuContext = createContext<EiyuStore | null>(null);

export function EiyuProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user.id;
  const qc = useQueryClient();

  const [questActionError, setQuestActionError] = useState<string | null>(null);
  const [retryingQuests, setRetryingQuests] = useState(false);
  const [retryingLongQuests, setRetryingLongQuests] = useState(false);
  const [lqActionError, setLqActionError] = useState<string | null>(null);

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
  const longQuestsQuery = useQuery({
    queryKey: longQuestsKey(userId),
    queryFn: () => fetchLongQuests(userId!),
    enabled: !!userId,
  });

  const quests = useMemo(() => habitsQuery.data ?? [], [habitsQuery.data]);
  const longQuests = useMemo(() => longQuestsQuery.data ?? [], [longQuestsQuery.data]);
  const stats = useMemo(() => statsQuery.data ?? initialUser.stats, [statsQuery.data]);
  const profile = profileQuery.data ?? null;

  const questsLoadError = retryingQuests
    ? undefined
    : [habitsQuery.error, profileQuery.error, statsQuery.error].find((e): e is Error => !!e);
  const questsError = questsLoadError ? formatError(questsLoadError) : questActionError;
  const longQuestsError =
    longQuestsQuery.isPending || retryingLongQuests
      ? null
      : longQuestsQuery.error
        ? formatError(longQuestsQuery.error)
        : lqActionError;

  /** Optimistic completion with rollback. */
  const runCompletion = useCallback(
    async (id: string, action: () => Promise<void>, optimisticCompleted: boolean) => {
      if (!userId) return;
      const key = habitsTodayKey(userId);
      qc.setQueryData<Quest[]>(key, qs =>
        qs?.map(q => (q.id === id ? { ...q, completed: optimisticCompleted } : q))
      );
      try {
        await action();
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['stats', userId] }),
          qc.invalidateQueries({ queryKey: key }),
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

  const completeRecovery = useCallback(
    async (id: string) => {
      const quest = quests.find(q => q.id === id);
      if (!quest || !userId || !quest.frozen || !quest.frozenDate) return;
      try {
        await completeHabit(userId, id, quest.stat, 'easy', quest.frozenDate);
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['stats', userId] }),
          qc.invalidateQueries({ queryKey: habitsTodayKey(userId) }),
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
      if (existingId) {
        await updateHabit(existingId, input);
      } else {
        await createHabit(userId, input);
      }
      await qc.invalidateQueries({ queryKey: ['habits'] });
      setQuestActionError(null);
    },
    [userId, qc]
  );

  const archiveQuest = useCallback(
    async (id: string) => {
      await archiveHabit(id);
      await qc.invalidateQueries({ queryKey: ['habits'] });
      setQuestActionError(null);
    },
    [qc]
  );

  const retryQuests = useCallback(async () => {
    setQuestActionError(null);
    setRetryingQuests(true);
    await Promise.all([
      qc.refetchQueries({ queryKey: habitsTodayKey(userId), type: 'active' }),
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
      questsLoading:
        habitsQuery.isLoading || profileQuery.isLoading || statsQuery.isLoading || retryingQuests,
      questsError,
      retryQuests,
      toggleQuest,
      completeRecovery,
      saveHabit,
      archiveQuest,
      toggleStage,
      longQuestsLoading: longQuestsQuery.isLoading || retryingLongQuests,
      longQuestsError,
      retryLongQuests,
      saveLongQuest,
      removeLongQuest,
    }),
    [
      user,
      habitsQuery.isLoading,
      profileQuery.isLoading,
      statsQuery.isLoading,
      retryingQuests,
      questsError,
      retryQuests,
      toggleQuest,
      completeRecovery,
      saveHabit,
      archiveQuest,
      toggleStage,
      longQuestsQuery.isLoading,
      retryingLongQuests,
      longQuestsError,
      retryLongQuests,
      saveLongQuest,
      removeLongQuest,
    ]
  );

  return <EiyuContext.Provider value={value}>{children}</EiyuContext.Provider>;
}

export function useEiyu() {
  const ctx = useContext(EiyuContext);
  if (!ctx) throw new Error('useEiyu must be used within EiyuProvider');
  return ctx;
}
