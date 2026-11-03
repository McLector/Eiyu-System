import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  acknowledgeGymMediaCleanup,
  archiveGymRoutine,
  convertGymWeight,
  deleteGymMedia,
  deleteGymRoutine,
  fetchGym,
  fetchRecentGymWeights,
  formatError,
  gymCleanupPending,
  gymSavedRefreshFailed,
  gymWeight,
  isGymCleanupNotice,
  listGymMediaCleanup,
  logGymWeight,
  moveGymExercises,
  newRequestId,
  NO_TARGETS,
  copyTrackerRevision,
  removeGymExercise,
  UncertainSaveError,
  type GymData,
  type GymExercise,
  type GymRecentWeight,
  type GymRoutine,
  type GymUnit,
  type TrackerAccess,
  type TrackerRevision,
} from '@eiyu/shared';

import { useAuth } from '@/contexts/auth-store';
import { refreshTrackerAfterFailure, trackerErrorMessage, trackerKey, TRACKER_MESSAGES, useAccountAudience, useTrackerAccess, type AccountAudience } from '@/contexts/tracker-access';

const EMPTY: GymData = { routines: [], exercises: [] };

interface GymStore {
  userId: string | undefined;
  loading: boolean;
  loadError: string | null;
  refreshError: boolean;
  retryLoad: () => void;
  recentError: boolean;
  retryRecent: () => void;

  /** Every routine, deleted ones too: workout history still names them. */
  allRoutines: GymRoutine[];
  /** Routines the picker offers: not deleted, and archived ones only on request. */
  routines: GymRoutine[];
  routine: GymRoutine | undefined;
  selectRoutine: (id: string) => void;
  showArchived: boolean;
  setShowArchived: (value: boolean) => void;
  exercises: GymExercise[];
  unit: GymUnit;
  /** The newest (recency 1, Current) or second newest (recency 2, Previous) logged weight, in the routine's unit. */
  logged: (exerciseId: string, recency: 1 | 2) => number | null;

  draft: (exerciseId: string) => string;
  setDraft: (exerciseId: string, value: string) => void;
  /** A typed weight that was never logged is unsaved work. */
  dirty: boolean;
  resetDrafts: () => void;
  logWeight: (exercise: GymExercise) => Promise<void>;

  pending: boolean;
  error: string | null;
  notice: string | null;
  uncertain: boolean;
  cleanupPending: boolean;
  clearError: () => void;
  retryUncertain: () => Promise<void>;
  retryCleanup: () => Promise<void>;

  archiveRoutine: () => Promise<void>;
  deleteRoutine: () => Promise<void>;
  /** True when the removal was confirmed. */
  removeExercise: (exercise: GymExercise) => Promise<boolean>;
  moveExercise: (exercise: GymExercise, delta: -1 | 1) => Promise<void>;
  /** After an editor saved something: reload and say so. */
  refreshAfterSave: (what: string, select?: string, warning?: string) => Promise<void>;
  setNotice: (message: string | null) => void;

  /** The signed-in owner's loaded tracker capability; null until it is read (every Gym write is refused meanwhile). */
  tracker: TrackerAccess | null;
  /** Gym writes are open only with Gym permission on an unpaused account. History is always readable. */
  canWriteFitness: boolean;
  /** True once the capability read settled (success or failure), so a notice is not shown while it is still loading. */
  trackerSettled: boolean;
  /** Take a server-confirmed capability for the current owner only; it closes the permission prompt. */
  acceptTracker: (access: TrackerAccess) => void;
  refreshTracker: () => Promise<void>;
  /** The Gym permission notice is open (set when a write was asked for without permission). */
  fitnessPrompt: boolean;
  setFitnessPrompt: (open: boolean) => void;
  /** Declared age band for the Gym notice; undefined (adult wording) until known or when unknown. */
  audience: AccountAudience | undefined;
  /** For a screen that opens an editor: true when Gym writes are open, otherwise it opens the permission notice. */
  requireFitness: () => boolean;
  /** For an editor's save: a copy of the current revision, or null (and the message to show) when writes are not open. */
  fitnessRevision: () => { revision: TrackerRevision } | { denied: string };
}

const GymContext = createContext<GymStore | null>(null);

export function GymProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id;
  return <GymWorkspace key={userId ?? 'none'} userId={userId}>{children}</GymWorkspace>;
}

function GymWorkspace({ userId, children }: { userId: string | undefined; children: ReactNode }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['gym', userId], queryFn: () => fetchGym(userId!), enabled: !!userId });
  const data = query.data ?? EMPTY;
  const [selected, setSelected] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const retryTask = useRef<(() => Promise<void>) | null>(null);
  const inFlight = useRef(false);

  const trackerQuery = useTrackerAccess(userId);
  const tracker = trackerQuery.data && trackerQuery.data.revision.userId === userId ? trackerQuery.data : null;
  const canWriteFitness = !!tracker && tracker.canWriteBasic && tracker.canWriteFitness;
  const trackerRef = useRef<TrackerAccess | null>(null);
  trackerRef.current = tracker;
  const [fitnessPrompt, setFitnessPrompt] = useState(false);
  const audience = useAccountAudience(userId, fitnessPrompt);

  const routines = useMemo(() => data.routines.filter(r => !r.deleted_at && (showArchived || !r.archived)), [data.routines, showArchived]);
  const routine = routines.find(r => r.id === selected) ?? routines[0];
  const exercises = useMemo(() => data.exercises.filter(e => e.routine_id === routine?.id), [data.exercises, routine?.id]);
  const unit: GymUnit = routine?.unit ?? 'kg';
  const recentKey = useMemo(() => ['gym-recent', userId, routine?.id] as const, [userId, routine?.id]);
  const recent = useQuery({ queryKey: recentKey, queryFn: () => fetchRecentGymWeights(routine!.id), enabled: !!userId && !!routine });

  const logged = useCallback((id: string, recency: 1 | 2): number | null => {
    const value = recent.data?.find(entry => entry.exercise_id === id && entry.recency === recency);
    return value ? convertGymWeight(value.weight, value.unit, unit) : null;
  }, [recent.data, unit]);
  const savedText = (id: string) => { const weight = logged(id, 1); return weight === null ? '' : String(weight); };
  const draft = (id: string) => weights[id] ?? savedText(id);
  const dirty = Object.entries(weights).some(([id, value]) => value !== savedText(id));

  const cleanup = useCallback(async () => {
    let after = '';
    for (;;) {
      const paths = await listGymMediaCleanup(after);
      for (const item of paths) { await deleteGymMedia(item.path); await acknowledgeGymMediaCleanup(item.path); after = item.path; }
      if (paths.length < 100) return;
    }
  }, []);
  useEffect(() => { if (userId) void cleanup().catch(err => setNotice(gymCleanupPending(err))); }, [cleanup, userId]);

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['gym', userId] }, { throwOnError: true });
    await qc.invalidateQueries({ queryKey: ['gym-recent', userId] }, { throwOnError: true });
  }, [qc, userId]);

  /** Runs one save; true when it was confirmed, false when it failed, was unconfirmed, or another one was running. */
  const run = useCallback(async (task: () => Promise<void>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true; setPending(true); setError(null); setNotice(null);
    try {
      await task();
      setUncertain(false); retryTask.current = null;
      try { await refresh(); } catch (err) { setNotice(gymSavedRefreshFailed('Saved', err)); }
      return true;
    } catch (err) {
      setUncertain(err instanceof UncertainSaveError);
      retryTask.current = err instanceof UncertainSaveError ? task : null;
      setError(trackerErrorMessage(err) ?? formatError(err));
      // A refused or stale write never replays: the capability is read again and the person decides.
      refreshTrackerAfterFailure(qc, userId, err);
      return false;
    } finally { inFlight.current = false; setPending(false); }
  }, [refresh, qc, userId]);

  /** A copy of the revision for one write, taken now. Without Gym permission it opens the notice and returns null. */
  const gate = (): TrackerRevision | null => {
    const access = trackerRef.current;
    if (!access || !access.canWriteBasic || !access.canWriteFitness) { setFitnessPrompt(true); return null; }
    return copyTrackerRevision(access.revision);
  };
  const requireFitness = (): boolean => gate() !== null;
  const fitnessRevision = (): { revision: TrackerRevision } | { denied: string } => {
    const access = trackerRef.current;
    if (!access) return { denied: 'Tracker access is unavailable. Try again in a moment.' };
    if (!access.canWriteBasic) return { denied: TRACKER_MESSAGES.paused };
    if (!access.canWriteFitness) return { denied: TRACKER_MESSAGES.fitness };
    return { revision: copyTrackerRevision(access.revision) };
  };
  const acceptTracker = useCallback((access: TrackerAccess) => {
    if (!userId || access.revision.userId !== userId) return;
    qc.setQueryData(trackerKey(userId), access);
    setFitnessPrompt(false);
  }, [qc, userId]);
  const refreshTracker = useCallback(async () => {
    if (userId) await qc.invalidateQueries({ queryKey: trackerKey(userId) });
  }, [qc, userId]);

  const resetDrafts = useCallback(() => setWeights({}), []);
  const forgetDraft = (id: string) => setWeights(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => key !== id)));

  const logWeight = async (exercise: GymExercise) => {
    let weight: number | null;
    try { weight = gymWeight(draft(exercise.id)); } catch (err) { setError(formatError(err)); return; }
    if (weight === null || weight === logged(exercise.id, 1)) return;
    // Made once per attempt: an unconfirmed attempt is retried by running this same task, so the id is reused.
    const logId = newRequestId();
    const expected = gate();
    if (!expected) return;
    await run(async () => {
      await logGymWeight(logId, exercise.id, weight, expected, NO_TARGETS);
      qc.setQueryData<GymRecentWeight[]>(recentKey, rows => {
        const newest = rows?.find(entry => entry.exercise_id === exercise.id && entry.recency === 1);
        return [
          ...(rows ?? []).filter(entry => entry.exercise_id !== exercise.id),
          { exercise_id: exercise.id, weight, unit, logged_at: new Date().toISOString(), recency: 1 },
          ...(newest ? [{ ...newest, recency: 2 as const }] : []),
        ];
      });
      forgetDraft(exercise.id);
      setNotice(`${exercise.name}: ${weight} ${unit} logged.`);
    });
  };

  const store: GymStore = {
    userId,
    loading: !!userId && query.isPending,
    loadError: query.isError && !query.data ? formatError(query.error) : null,
    refreshError: query.isError && !!query.data,
    retryLoad: () => { void query.refetch(); },
    recentError: recent.isError,
    retryRecent: () => { void recent.refetch(); },
    allRoutines: data.routines, routines, routine, selectRoutine: setSelected, showArchived, setShowArchived, exercises, unit, logged,
    draft, setDraft: (id, value) => setWeights(previous => ({ ...previous, [id]: value })), dirty, resetDrafts, logWeight,
    pending, error, notice, uncertain, cleanupPending: isGymCleanupNotice(notice),
    clearError: () => setError(null),
    retryUncertain: async () => { if (retryTask.current) await run(retryTask.current); },
    retryCleanup: async () => {
      try { await cleanup(); setNotice('Media cleanup complete.'); } catch (err) { setNotice(gymCleanupPending(err)); }
    },
    archiveRoutine: async () => {
      if (!routine) return;
      const expected = gate();
      if (!expected) return;
      await run(async () => { await archiveGymRoutine(routine.id, !routine.archived, expected, NO_TARGETS); resetDrafts(); });
    },
    deleteRoutine: async () => {
      if (!routine) return;
      const expected = gate();
      if (!expected) return;
      // An unseen draft left by a tab on an older client is discarded with the routine, never blocking the delete.
      await run(async () => {
        await deleteGymRoutine(routine.id, expected, NO_TARGETS, true);
        resetDrafts();
        await cleanup().catch(err => setNotice(gymCleanupPending(err, 'Routine deleted')));
      });
    },
    removeExercise: async exercise => {
      const expected = gate();
      if (!expected) return false;
      return run(async () => {
        await removeGymExercise(exercise.id, expected, NO_TARGETS);
        await cleanup().catch(err => setNotice(gymCleanupPending(err, 'Exercise removed')));
      });
    },
    moveExercise: async (exercise, delta) => {
      if (!routine) return;
      const ids = exercises.map(e => e.id);
      const at = ids.indexOf(exercise.id);
      if (at < 0 || at + delta < 0 || at + delta >= ids.length) return;
      [ids[at], ids[at + delta]] = [ids[at + delta], ids[at]];
      const expected = gate();
      if (!expected) return;
      await run(async () => { await moveGymExercises(routine, ids, expected, NO_TARGETS); });
    },
    refreshAfterSave: async (what, select, warning) => {
      if (select) setSelected(select);
      try { await refresh(); setNotice(warning ?? `${what} saved.`); } catch (err) { setNotice(gymSavedRefreshFailed(`${what} saved`, err)); }
    },
    setNotice,
    tracker, canWriteFitness, trackerSettled: !trackerQuery.isPending, acceptTracker, refreshTracker,
    fitnessPrompt, setFitnessPrompt, audience, requireFitness, fitnessRevision,
  };
  return <GymContext.Provider value={store}>{children}</GymContext.Provider>;
}

export function useGym(): GymStore {
  const ctx = useContext(GymContext);
  if (!ctx) throw new Error('useGym must be used within GymProvider');
  return ctx;
}
