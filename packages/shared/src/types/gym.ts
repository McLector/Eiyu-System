export type GymUnit = 'kg' | 'lb';
export interface GymRoutine { id: string; user_id: string; name: string; unit: GymUnit; archived: boolean; created_at: string }
export interface GymExercise {
  id: string; routine_id: string; user_id: string; name: string; position: number;
  sets: number; reps: string; rest_seconds: number; rir: number; notes: string;
  media_path: string | null; media_mime: 'image/gif' | 'video/mp4' | null;
}
export type GymPrescription = Pick<GymExercise, 'name' | 'sets' | 'reps' | 'rest_seconds' | 'rir' | 'notes'>;
export interface GymSession { id: string; routine_id: string; user_id: string; routine_name: string; unit: GymUnit; status: 'draft' | 'completed'; created_at: string; completed_at: string | null }
export interface GymEntry { id: string; session_id: string; user_id: string; exercise_id: string; position: number; prescription: GymPrescription; weight: number | null }
export interface GymData { routines: GymRoutine[]; exercises: GymExercise[]; sessions: GymSession[]; entries: GymEntry[] }
