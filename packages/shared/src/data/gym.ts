import { supabase } from '../supabase/client';
import type { GymData, GymEntry, GymExercise, GymRoutine, GymUnit, GymPreviousWeight, GymRecentWeight } from '../types/gym';
import { normalizeEditableQuestName } from '../logic/validation';
import { normalizeGymExercise } from '../logic/gym';
import { readBatches } from './pagination';
import { isConfirmedFailure, UncertainSaveError } from './save-outcome';

const uncertainWrites = new Map<string, string>();

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
export async function logGymWeight(logId: string, exerciseId: string, weight: number): Promise<void> {
  const { error } = await supabase.rpc('log_gym_weight', { p_log_id: logId, p_exercise_id: exerciseId, p_weight: weight });
  if (!error) return;
  if (isConfirmedFailure(error)) throw error;
  const landed = await supabase.from('gym_sessions').select('id').eq('id', logId).maybeSingle();
  if (!landed.error && landed.data) return;
  throw new UncertainSaveError();
}
export async function saveGymRoutine(userId: string, name: string, unit: GymUnit, id?: string, creationId?: string): Promise<string> {
  const stableId = id ?? creationId ?? crypto.randomUUID();
  const row = { user_id: userId, name: normalizeEditableQuestName(name), unit };
  const signature = JSON.stringify(row);
  if (uncertainWrites.has(stableId)) {
    if (uncertainWrites.get(stableId) !== signature) throw new UncertainSaveError();
    const prior = await supabase.from('gym_routines').select('*').eq('id', stableId).maybeSingle();
    if (prior.error) throw new UncertainSaveError();
    if (prior.data?.name === row.name && prior.data.unit === unit && !prior.data.deleted_at) { uncertainWrites.delete(stableId); return stableId; }
  }
  const query = id ? supabase.from('gym_routines').update({ name: row.name, unit }).eq('id', id).eq('user_id', userId) : supabase.from('gym_routines').insert({ ...row, id: stableId });
  const { data, error } = await query.select('id').single();
  if (!error) { uncertainWrites.delete(stableId); return data.id; }
  const check = await supabase.from('gym_routines').select('*').eq('id', stableId).maybeSingle();
  if (!check.error && check.data?.name === row.name && check.data.unit === unit && !check.data.deleted_at) { uncertainWrites.delete(stableId); return stableId; }
  if (isConfirmedFailure(error) && !check.error) throw error;
  uncertainWrites.set(stableId, signature);
  throw new UncertainSaveError();
}
export async function archiveGymRoutine(id: string, archived: boolean) {
  const { error } = await supabase.from('gym_routines').update({ archived }).eq('id', id);
  if (!error) return;
  const check = await supabase.from('gym_routines').select('archived').eq('id', id).maybeSingle();
  if (!check.error && check.data?.archived === archived) return;
  throw isConfirmedFailure(error) ? error : new UncertainSaveError();
}
export async function saveGymExercise(input: Omit<GymExercise, 'id'> & { id?: string }): Promise<string> {
  const id = input.id ?? crypto.randomUUID();
  const row = { ...input, ...normalizeGymExercise(input), id };
  const signature = JSON.stringify(row);
  if (uncertainWrites.has(id)) {
    if (uncertainWrites.get(id) !== signature) throw new UncertainSaveError();
    const prior = await supabase.from('gym_exercises').select('*').eq('id', id).maybeSingle();
    if (prior.error) throw new UncertainSaveError();
    if (prior.data && Object.entries(row).every(([key, value]) => value === (prior.data as Record<string, unknown>)[key])) { uncertainWrites.delete(id); return id; }
  }
  const { error } = await supabase.rpc('save_gym_exercise', { p_id: id, p_input: row });
  if (!error) { uncertainWrites.delete(id); return id; }
  const check = await supabase.from('gym_exercises').select('*').eq('id', id).maybeSingle();
  if (!check.error && check.data && Object.entries(row).every(([key, value]) => value === (check.data as Record<string, unknown>)[key])) { uncertainWrites.delete(id); return id; }
  if (isConfirmedFailure(error) && !check.error) throw error;
  uncertainWrites.set(id, signature);
  throw new UncertainSaveError();
}
export async function removeGymExercise(id: string) {
  const { error } = await supabase.rpc('remove_gym_exercise', { p_id: id });
  if (!error) return;
  const check = await supabase.from('gym_exercises').select('id').eq('id', id).maybeSingle();
  if (!check.error && !check.data) return;
  throw isConfirmedFailure(error) ? error : new UncertainSaveError();
}
export async function deleteGymRoutine(id: string, discardDraft = false) {
  const { error } = await supabase.rpc('delete_gym_routine', { p_routine_id: id, p_discard_draft: discardDraft });
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
export async function moveGymExercises(routine: GymRoutine, ids: string[]) {
  const { error } = await supabase.rpc('reorder_gym_exercises', { p_routine_id: routine.id, p_ids: ids });
  if (error) throw error;
}
export async function startGymSession(routineId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_gym_session', { p_routine_id: routineId });
  if (error) {
    if (isConfirmedFailure(error)) throw error;
    const check = await supabase.from('gym_sessions').select('id').eq('routine_id', routineId).eq('status', 'draft').maybeSingle();
    if (!check.error && check.data) return check.data.id;
    throw new UncertainSaveError();
  }
  return data;
}
export async function saveGymSession(sessionId: string, weights: { exercise_id: string; weight: number | null }[], finish = false) {
  const signature = JSON.stringify({ weights, finish });
  if (uncertainWrites.has(sessionId)) {
    if (uncertainWrites.get(sessionId) !== signature) throw new UncertainSaveError();
    const prior = await supabase.from('gym_sessions').select('*').eq('id', sessionId).maybeSingle();
    if (prior.error || !prior.data) throw new UncertainSaveError();
    let entries: GymEntry[];
    try { entries = await fetchGymEntries(prior.data.user_id, [sessionId]); } catch { throw new UncertainSaveError(); }
    if ((!finish || prior.data.status === 'completed') && weights.every(w => entries.some(e => e.exercise_id === w.exercise_id && e.weight === w.weight))) { uncertainWrites.delete(sessionId); return; }
  }
  const { error } = await supabase.rpc('save_gym_session', { p_session_id: sessionId, p_weights: weights, p_finish: finish });
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
export async function discardGymSession(sessionId: string) {
  const { error } = await supabase.rpc('discard_gym_session', { p_session_id: sessionId });
  if (!error) return;
  const check = await supabase.from('gym_sessions').select('id').eq('id', sessionId).maybeSingle();
  if (!check.error && !check.data) return;
  throw isConfirmedFailure(error) ? error : new UncertainSaveError();
}
