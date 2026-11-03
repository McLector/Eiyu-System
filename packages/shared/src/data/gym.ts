import { supabase } from '../supabase/client';
import type { GymData, GymEntry, GymExercise, GymRoutine, GymUnit, GymPreviousWeight, GymRecentWeight } from '../types/gym';
import { normalizeEditableQuestName } from '../logic/validation';
import { normalizeGymExercise } from '../logic/gym';
import { newRequestId } from '../logic/request-id';
import { readBatches } from './pagination';
import { isConfirmedFailure, UncertainSaveError } from './save-outcome';
import type { TrackerOperation, TrackerRevision, TrackerTargetSnapshot } from './tracker-access';
import { invokeTrackerWrite, isRefusedBeforeSend, trackerErrorKind } from './tracker-writes';

const uncertainWrites = new Map<string, string>();

type Targets = readonly TrackerTargetSnapshot[];

/**
 * One gateway attempt. A failure before the request left the device, or a tracker refusal from the server, propagates
 * (nothing landed, nothing to reconcile);
 * any other failure comes back as `error` so the caller can look for a landed write, exactly as before the gateway.
 */
async function attempt(operation: TrackerOperation, args: Record<string, unknown>, expected: TrackerRevision, targets: Targets): Promise<{ data: unknown; error: unknown }> {
  try {
    return { data: await invokeTrackerWrite<unknown>(operation, args, expected, targets), error: null };
  } catch (error) {
    // A tracker refusal (paused, permission, stale, invalid, denied) is a confirmed no-write: nothing landed.
    if (isRefusedBeforeSend(error) || trackerErrorKind(error)) throw error;
    return { data: null, error: error ?? new Error('write failed') };
  }
}
const sameId = (value: unknown, id: string) => typeof value === 'string' && value.toLowerCase() === id.toLowerCase();
const UNCONFIRMED = 'The save result could not be confirmed. Check the saved record before retrying.';


export async function fetchGym(userId: string): Promise<GymData> {
  const [routines, exercises] = await Promise.all([
    readBatches((from, to) => supabase.from('gym_routines').select('*').eq('user_id', userId).order('created_at').order('id').range(from, to)),
    readBatches((from, to) => supabase.from('gym_exercises').select('*').eq('user_id', userId).order('position').order('id').range(from, to)),
  ]);
  return { routines, exercises };
}
export async function fetchGymEntries(userId: string, ids: string[]): Promise<GymEntry[]> {
  const entries: GymEntry[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const chunk = ids.slice(index, index + 100);
    entries.push(...await readBatches((from, to) => supabase.from('gym_entries').select('*').eq('user_id', userId).in('session_id', chunk).order('session_id').order('position').order('id').range(from, to)) as unknown as GymEntry[]);
  }
  return entries;
}
export async function fetchGymHistory(userId: string, page = 0, routineId?: string) {
  let query = supabase.from('gym_sessions').select('*').eq('user_id', userId).eq('status', 'completed');
  if (routineId) query = query.eq('routine_id', routineId);
  const { data, error } = await query.order('completed_at', { ascending: false }).order('id', { ascending: false }).range(page * 10, page * 10 + 10);
  if (error) throw error;
  const sessions = (data ?? []).slice(0, 10);
  return { sessions, hasNext: (data?.length ?? 0) > 10, entries: await fetchGymEntries(userId, sessions.map(s => s.id)) };
}
export async function fetchPreviousGymWeights(routineId: string): Promise<GymPreviousWeight[]> {
  return readBatches((from, to) => supabase.rpc('previous_gym_weights', { p_routine_id: routineId }).range(from, to)) as Promise<GymPreviousWeight[]>;
}
/** The two newest logged weights of every exercise in a routine: recency 1 is Current, recency 2 is Previous. */
export async function fetchRecentGymWeights(routineId: string): Promise<GymRecentWeight[]> {
  return readBatches((from, to) => supabase.rpc('recent_gym_weights', { p_routine_id: routineId }).range(from, to)) as Promise<GymRecentWeight[]>;
}
/**
 * Log one weight. `logId` is chosen by the caller and kept for retries: the server stores it as the log's id, so a
 * retry of a log that already landed changes nothing.
 */
export async function logGymWeight(logId: string, exerciseId: string, weight: number, expected: TrackerRevision, targets: Targets): Promise<void> {
  const { error } = await attempt('log_gym_weight', { p_log_id: logId, p_exercise_id: exerciseId, p_weight: weight }, expected, targets);
  if (!error) return;
  if (isConfirmedFailure(error)) throw error;
  const landed = await supabase.from('gym_sessions').select('id').eq('id', logId).maybeSingle();
  if (!landed.error && landed.data) return;
  throw new UncertainSaveError();
}
export async function saveGymRoutine(userId: string, name: string, unit: GymUnit, expected: TrackerRevision, targets: Targets, id?: string, creationId?: string): Promise<string> {
  const stableId = id ?? creationId ?? newRequestId();
  const row = { user_id: userId, name: normalizeEditableQuestName(name), unit };
  const signature = JSON.stringify(row);
  if (uncertainWrites.has(stableId)) {
    if (uncertainWrites.get(stableId) !== signature) throw new UncertainSaveError();
    const prior = await supabase.from('gym_routines').select('*').eq('id', stableId).maybeSingle();
    if (prior.error) throw new UncertainSaveError();
    if (prior.data?.name === row.name && prior.data.unit === unit && !prior.data.deleted_at) { uncertainWrites.delete(stableId); return stableId; }
  }
  const { data, error } = await attempt('gym-routine-save', { p_id: stableId, p_create: !id, p_name: row.name, p_unit: unit }, expected, targets);
  if (!error) {
    if (!sameId(data, stableId)) throw new Error(UNCONFIRMED);
    uncertainWrites.delete(stableId);
    return stableId;
  }
  const check = await supabase.from('gym_routines').select('*').eq('id', stableId).maybeSingle();
  if (!check.error && check.data?.name === row.name && check.data.unit === unit && !check.data.deleted_at) { uncertainWrites.delete(stableId); return stableId; }
  if (isConfirmedFailure(error) && !check.error) throw error;
  uncertainWrites.set(stableId, signature);
  throw new UncertainSaveError();
}
export async function archiveGymRoutine(id: string, archived: boolean, expected: TrackerRevision, targets: Targets) {
  const { error } = await attempt('gym-routine-archive', { p_id: id, p_archived: archived }, expected, targets);
  if (!error) return;
  const check = await supabase.from('gym_routines').select('archived').eq('id', id).maybeSingle();
  if (!check.error && check.data?.archived === archived) return;
  throw isConfirmedFailure(error) ? error : new UncertainSaveError();
}
/** The keys the gateway accepts for an exercise; anything else a caller's object carries is never sent. */
const EXERCISE_KEYS = ['id', 'user_id', 'routine_id', 'name', 'position', 'sets', 'reps', 'rest_seconds', 'rir', 'rir_max', 'notes', 'media_path', 'media_mime'] as const;
export async function saveGymExercise(input: Omit<GymExercise, 'id'> & { id?: string }, expected: TrackerRevision, targets: Targets): Promise<string> {
  const id = input.id ?? newRequestId();
  const merged = { ...input, ...normalizeGymExercise(input), id } as Record<string, unknown>;
  const row: Record<string, unknown> = {};
  for (const key of EXERCISE_KEYS) if (merged[key] !== undefined) row[key] = merged[key];
  const signature = JSON.stringify(row);
  if (uncertainWrites.has(id)) {
    if (uncertainWrites.get(id) !== signature) throw new UncertainSaveError();
    const prior = await supabase.from('gym_exercises').select('*').eq('id', id).maybeSingle();
    if (prior.error) throw new UncertainSaveError();
    if (prior.data && Object.entries(row).every(([key, value]) => value === (prior.data as Record<string, unknown>)[key])) { uncertainWrites.delete(id); return id; }
  }
  const { data, error } = await attempt('save_gym_exercise', { p_id: id, p_input: row }, expected, targets);
  if (!error) {
    if (!sameId(data, id)) throw new Error(UNCONFIRMED);
    uncertainWrites.delete(id);
    return id;
  }
  const check = await supabase.from('gym_exercises').select('*').eq('id', id).maybeSingle();
  if (!check.error && check.data && Object.entries(row).every(([key, value]) => value === (check.data as Record<string, unknown>)[key])) { uncertainWrites.delete(id); return id; }
  if (isConfirmedFailure(error) && !check.error) throw error;
  uncertainWrites.set(id, signature);
  throw new UncertainSaveError();
}
export async function removeGymExercise(id: string, expected: TrackerRevision, targets: Targets) {
  const { error } = await attempt('remove_gym_exercise', { p_id: id }, expected, targets);
  if (!error) return;
  const check = await supabase.from('gym_exercises').select('id').eq('id', id).maybeSingle();
  if (!check.error && !check.data) return;
  throw isConfirmedFailure(error) ? error : new UncertainSaveError();
}
export async function deleteGymRoutine(id: string, expected: TrackerRevision, targets: Targets, discardDraft = false) {
  const { error } = await attempt('delete_gym_routine', { p_routine_id: id, p_discard_draft: discardDraft }, expected, targets);
  if (!error) return;
  const check = await supabase.from('gym_routines').select('deleted_at').eq('id', id).maybeSingle();
  if (!check.error && check.data?.deleted_at) return;
  throw isConfirmedFailure(error) ? error : new UncertainSaveError();
}
export async function listGymMediaCleanup(after = '') {
  const { data, error } = await supabase.rpc('list_gym_media_cleanup', { p_after: after, p_limit: 100 });
  if (error) throw error;
  return data;
}
export async function acknowledgeGymMediaCleanup(path: string) {
  const { error } = await supabase.rpc('ack_gym_media_cleanup', { p_path: path });
  if (error) throw error;
}
export async function moveGymExercises(routine: GymRoutine, ids: string[], expected: TrackerRevision, targets: Targets) {
  const { error } = await attempt('reorder_gym_exercises', { p_routine_id: routine.id, p_ids: [...ids] }, expected, targets);
  if (error) throw error;
}
export async function startGymSession(routineId: string, expected: TrackerRevision, targets: Targets): Promise<string> {
  const { data, error } = await attempt('start_gym_session', { p_routine_id: routineId }, expected, targets);
  if (error) {
    if (isConfirmedFailure(error)) throw error;
    const check = await supabase.from('gym_sessions').select('id').eq('routine_id', routineId).eq('status', 'draft').maybeSingle();
    if (!check.error && check.data) return check.data.id;
    throw new UncertainSaveError();
  }
  if (typeof data !== 'string' || !data) throw new Error(UNCONFIRMED);
  return data;
}
export async function saveGymSession(sessionId: string, weights: { exercise_id: string; weight: number | null }[], expected: TrackerRevision, targets: Targets, finish = false) {
  const signature = JSON.stringify({ weights, finish });
  if (uncertainWrites.has(sessionId)) {
    if (uncertainWrites.get(sessionId) !== signature) throw new UncertainSaveError();
    const prior = await supabase.from('gym_sessions').select('*').eq('id', sessionId).maybeSingle();
    if (prior.error || !prior.data) throw new UncertainSaveError();
    let entries: GymEntry[];
    try { entries = await fetchGymEntries(prior.data.user_id, [sessionId]); } catch { throw new UncertainSaveError(); }
    if ((!finish || prior.data.status === 'completed') && weights.every(w => entries.some(e => e.exercise_id === w.exercise_id && e.weight === w.weight))) { uncertainWrites.delete(sessionId); return; }
  }
  const { error } = await attempt('save_gym_session', { p_session_id: sessionId, p_weights: weights.map(w => ({ ...w })), p_finish: finish }, expected, targets);
  if (!error) { uncertainWrites.delete(sessionId); return; }
  if (isConfirmedFailure(error)) throw error;
  uncertainWrites.set(sessionId, signature);
  const session = await supabase.from('gym_sessions').select('*').eq('id', sessionId).maybeSingle();
  if (!session.error && session.data) {
    let entries: GymEntry[];
    try { entries = await fetchGymEntries(session.data.user_id, [sessionId]); } catch { throw new UncertainSaveError(); }
    if ((!finish || session.data.status === 'completed') && weights.every(w => entries.some(e => e.exercise_id === w.exercise_id && e.weight === w.weight))) { uncertainWrites.delete(sessionId); return; }
  }
  uncertainWrites.set(sessionId, signature);
  throw new UncertainSaveError();
}
export async function discardGymSession(sessionId: string, expected: TrackerRevision, targets: Targets) {
  const { error } = await attempt('discard_gym_session', { p_session_id: sessionId }, expected, targets);
  if (!error) return;
  const check = await supabase.from('gym_sessions').select('id').eq('id', sessionId).maybeSingle();
  if (!check.error && !check.data) return;
  throw isConfirmedFailure(error) ? error : new UncertainSaveError();
}
