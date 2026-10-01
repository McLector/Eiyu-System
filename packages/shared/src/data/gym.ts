import { supabase } from '../supabase/client';
import type { GymData, GymEntry, GymExercise, GymRoutine, GymUnit } from '../types/gym';
import { normalizeEditableQuestName } from '../logic/validation';
import { normalizeGymExercise } from '../logic/gym';

export async function fetchGym(userId: string): Promise<GymData> {
  const [routines, exercises, sessions, entries] = await Promise.all([
    supabase.from('gym_routines').select('*').eq('user_id', userId).order('created_at'),
    supabase.from('gym_exercises').select('*').eq('user_id', userId).order('position').order('id'),
    supabase.from('gym_sessions').select('*').eq('user_id', userId).order('completed_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
    supabase.from('gym_entries').select('*').eq('user_id', userId).order('position'),
  ]);
  for (const result of [routines, exercises, sessions, entries]) if (result.error) throw result.error;
  return { routines: routines.data ?? [], exercises: exercises.data ?? [], sessions: sessions.data ?? [], entries: (entries.data ?? []) as unknown as GymEntry[] };
}
export async function saveGymRoutine(userId: string, name: string, unit: GymUnit, id?: string): Promise<string> {
  const row = { user_id: userId, name: normalizeEditableQuestName(name), unit };
  const query = id ? supabase.from('gym_routines').update(row).eq('id', id) : supabase.from('gym_routines').insert(row);
  const { data, error } = await query.select('id').single();
  if (error) throw error;
  return data.id;
}
export async function archiveGymRoutine(id: string, archived: boolean) {
  const { error } = await supabase.from('gym_routines').update({ archived }).eq('id', id);
  if (error) throw error;
}
export async function saveGymExercise(input: Omit<GymExercise, 'id'> & { id?: string }): Promise<void> {
  const normalized = normalizeGymExercise(input);
  const row = { ...input, ...normalized };
  const query = input.id ? supabase.from('gym_exercises').update(row).eq('id', input.id) : supabase.from('gym_exercises').insert(row);
  const { error } = await query.select('id').single();
  if (error) throw error;
}
export async function removeGymExercise(id: string) {
  const { error } = await supabase.from('gym_exercises').delete().eq('id', id);
  if (error) throw error;
}
export async function moveGymExercises(routine: GymRoutine, ids: string[]) {
  const { error } = await supabase.rpc('reorder_gym_exercises', { p_routine_id: routine.id, p_ids: ids });
  if (error) throw error;
}
export async function startGymSession(routineId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_gym_session', { p_routine_id: routineId });
  if (error) throw error;
  return data;
}
export async function saveGymSession(sessionId: string, weights: { exercise_id: string; weight: number | null }[], finish = false) {
  const { error } = await supabase.rpc('save_gym_session', { p_session_id: sessionId, p_weights: weights, p_finish: finish });
  if (error) throw error;
}
export async function discardGymSession(sessionId: string) {
  const { error } = await supabase.rpc('discard_gym_session', { p_session_id: sessionId });
  if (error) throw error;
}
