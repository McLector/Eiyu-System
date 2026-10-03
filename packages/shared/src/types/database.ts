import type { GymRoutine, GymExercise, GymSession, GymEntry } from './gym';
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type GymTable<T> = { Row: { [K in keyof T]: T[K] }; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };
// Hand-written to match backend/supabase/*.sql. Regenerate with
// `supabase gen types typescript` once the CLI is wired into this project;
// until then, keep this in sync with the migrations by hand.

export type StatKey = 'STR' | 'INT' | 'DEX' | 'WIS' | 'CHA';
export type DifficultyKey = 'Easy' | 'Medium' | 'Hard';
export type CompletionKind = 'full' | 'easy';
export type ThemeKey = 'dark' | 'light';
/** Recurring habit vs one-time (today-only) quest — see 011_quest_types.sql. */
export type QuestTypeKey = 'habit' | 'one_time';

export interface Database {
  public: {
    Tables: {
      gym_routines: GymTable<GymRoutine>;
      gym_exercises: GymTable<GymExercise>;
      gym_sessions: GymTable<GymSession>;
      gym_entries: GymTable<GymEntry>;
      profiles: {
        Row: {
          user_id: string;
          display_name: string;
          user_class: string;
          target_role: string | null;
          theme: ThemeKey;
          time_zone: string | null;
          time_zone_changed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Omit<Database['public']['Tables']['profiles']['Row'], 'user_id'>> & {
          user_id: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Row']>;
        Relationships: [];
      };
      stats: {
        Row: {
          user_id: string;
          stat: StatKey;
          xp: number;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['stats']['Row']> & {
          user_id: string;
          stat: StatKey;
        };
        Update: Partial<Database['public']['Tables']['stats']['Row']>;
        Relationships: [];
      };
      habits: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          easy_version: string | null;
          description: string | null;
          quest_type: QuestTypeKey;
          stat: StatKey;
          difficulty: DifficultyKey;
          reminder_time: string;
          days: number[];
          archived: boolean;
          created_at: string;
          updated_at: string;
          scheduled_date: string | null;
          target_count: number | null;
          schedule_start_on: string;
        };
        Insert: Partial<Omit<Database['public']['Tables']['habits']['Row'], 'user_id'>> & {
          user_id: string;
          name: string;
          stat: StatKey;
        };
        Update: Partial<Database['public']['Tables']['habits']['Row']>;
        Relationships: [];
      };
      habit_progress: {
        Row: {
          id: string;
          user_id: string;
          habit_id: string;
          progress_date: string;
          progress_count: number;
        };
        Insert: Partial<Database['public']['Tables']['habit_progress']['Row']> & {
          user_id: string;
          habit_id: string;
          progress_date: string;
        };
        Update: Partial<Database['public']['Tables']['habit_progress']['Row']>;
        Relationships: [];
      };
      habit_schedule_versions: {
        Row: {
          habit_id: string;
          user_id: string;
          effective_from: string;
          days: number[];
          created_at: string;
        };
        Insert: Database['public']['Tables']['habit_schedule_versions']['Row'];
        Update: Partial<Database['public']['Tables']['habit_schedule_versions']['Row']>;
        Relationships: [];
      };
      habit_occurrences: {
        Row: {
          habit_id: string;
          user_id: string;
          occurrence_date: string;
          time_zone: string;
          day_ends_at: string;
          created_at: string;
        };
        Insert: Database['public']['Tables']['habit_occurrences']['Row'];
        Update: Partial<Database['public']['Tables']['habit_occurrences']['Row']>;
        Relationships: [];
      };
      habit_completions: {
        Row: {
          id: string;
          user_id: string;
          habit_id: string;
          completed_on: string;
          kind: CompletionKind;
          xp_awarded: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['habit_completions']['Row']> & {
          user_id: string;
          habit_id: string;
          kind: CompletionKind;
          xp_awarded: number;
        };
        Update: Partial<Database['public']['Tables']['habit_completions']['Row']>;
        Relationships: [];
      };
      streaks: {
        Row: {
          habit_id: string;
          user_id: string;
          best: number;
          current_streak: number;
          recovery_armed: boolean;
          last_processed_on: string | null;
          active_recovery_id: string | null;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['streaks']['Row']> & {
          habit_id: string;
          user_id: string;
        };
        Update: Partial<Database['public']['Tables']['streaks']['Row']>;
        Relationships: [];
      };
      habit_recovery_windows: {
        Row: {
          id: string;
          habit_id: string;
          user_id: string;
          missed_on: string;
          preserved_streak: number;
          opened_at: string;
          deadline_at: string;
          status: 'open' | 'recovered' | 'expired';
          resolved_at: string | null;
          created_at: string;
        };
        Insert: Partial<Omit<Database['public']['Tables']['habit_recovery_windows']['Row'], 'habit_id' | 'user_id' | 'missed_on' | 'preserved_streak' | 'opened_at' | 'deadline_at'>> & {
          habit_id: string;
          user_id: string;
          missed_on: string;
          preserved_streak: number;
          opened_at: string;
          deadline_at: string;
        };
        Update: Partial<Database['public']['Tables']['habit_recovery_windows']['Row']>;
        Relationships: [];
      };
      deleted_habit_history: {
        Row: {
          id: string;
          user_id: string;
          source_habit_id: string;
          historical_date: string;
          habit_name: string;
          stat: StatKey;
          quest_type: QuestTypeKey;
          scheduled: boolean;
          completion_kind: CompletionKind | null;
          xp_awarded: number;
          time_zone: string | null;
          day_ends_at: string | null;
          created_at: string;
        };
        Insert: Partial<Omit<Database['public']['Tables']['deleted_habit_history']['Row'], 'user_id'>> & {
          user_id: string;
          source_habit_id: string;
          historical_date: string;
          habit_name: string;
          stat: StatKey;
          quest_type: QuestTypeKey;
        };
        Update: Partial<Database['public']['Tables']['deleted_habit_history']['Row']>;
        Relationships: [];
      };
      habit_archive_intervals: {
        Row: {
          id: string;
          habit_id: string;
          user_id: string;
          archived_from: string;
          restored_on: string | null;
          created_at: string;
        };
        Insert: Partial<Omit<Database['public']['Tables']['habit_archive_intervals']['Row'], 'habit_id' | 'user_id'>> & {
          habit_id: string;
          user_id: string;
          archived_from: string;
        };
        Update: Partial<Database['public']['Tables']['habit_archive_intervals']['Row']>;
        Relationships: [];
      };
      long_quests: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          stat: StatKey;
          description: string | null;
          deadline: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['long_quests']['Row']> & {
          user_id: string;
          name: string;
          stat: StatKey;
        };
        Update: Partial<Database['public']['Tables']['long_quests']['Row']>;
        Relationships: [];
      };
      long_quest_stages: {
        Row: {
          id: string;
          long_quest_id: string;
          user_id: string;
          name: string;
          position: number;
          done: boolean;
          description: string | null;
        };
        Insert: Partial<Database['public']['Tables']['long_quest_stages']['Row']> & {
          long_quest_id: string;
          user_id: string;
          name: string;
          position: number;
        };
        Update: Partial<Database['public']['Tables']['long_quest_stages']['Row']>;
        Relationships: [];
      };
      weekly_quests: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          stat: StatKey;
          target_count: number;
          current_count: number;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['weekly_quests']['Row']> & {
          user_id: string;
          week_start: string;
          stat: StatKey;
          target_count: number;
        };
        Update: Partial<Database['public']['Tables']['weekly_quests']['Row']>;
        Relationships: [];
      };
      weekly_summaries: {
        Row: {
          id: string;
          user_id: string;
          week_start: string;
          summary: string;
          regenerate_count: number;
          last_regenerated_date: string | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['weekly_summaries']['Row']> & {
          user_id: string;
          week_start: string;
          summary: string;
        };
        Update: Partial<Database['public']['Tables']['weekly_summaries']['Row']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      start_gym_session: { Args: { p_routine_id: string }; Returns: string };
      save_gym_session: { Args: { p_session_id: string; p_weights: Json; p_finish: boolean }; Returns: undefined };
      discard_gym_session: { Args: { p_session_id: string }; Returns: undefined };
      reorder_gym_exercises: { Args: { p_routine_id: string; p_ids: string[] }; Returns: undefined };
      delete_gym_routine: { Args: { p_routine_id: string; p_discard_draft: boolean }; Returns: undefined };
      save_gym_exercise: { Args: { p_id: string; p_input: Json }; Returns: string };
      remove_gym_exercise: { Args: { p_id: string }; Returns: undefined };
      previous_gym_weights: { Args: { p_routine_id: string }; Returns: import('./gym').GymPreviousWeight[] };
      list_gym_media_cleanup: { Args: { p_after: string; p_limit: number }; Returns: { path: string }[] };
      ack_gym_media_cleanup: { Args: { p_path: string }; Returns: undefined };
      increment_stat_xp: {
        Args: { p_stat: StatKey; p_delta: number };
        Returns: undefined;
      };
      /** Migration 012: atomic completion insert + XP award in one call. XP computed server-side since migration 014. */
      complete_habit: {
        Args: {
          p_habit_id: string;
          p_completed_on: string;
          p_kind: CompletionKind;
        };
        Returns: undefined;
      };
      /** Migration 013: atomic undo - delete completion + reverse XP. */
      undo_habit_completion: {
        Args: { p_habit_id: string; p_completed_on: string };
        Returns: undefined;
      };
      /** Slice 2: reserve a weekly summary regeneration slot (capped 2/day per week). */
      reserve_weekly_summary_regen: {
        Args: { p_week_start: string };
        Returns: number;
      };
      /** Slice 3: reconcile long quest stages (insert new, update existing, delete absent). */
      reconcile_long_quest_stages: {
        Args: { p_long_quest_id: string; p_stages: unknown };
        Returns: undefined;
      };
      set_long_quest_stage_done: {
        Args: { p_stage_id: string; p_done: boolean };
        Returns: undefined;
      };
      set_long_quest_stage_done_receipt: { Args: { p_stage_id: string; p_done: boolean; p_request_id: string }; Returns: Json };
      get_long_quest_reward_receipt: { Args: { p_request_id: string }; Returns: Json };
      save_long_quest_definition: { Args: { p_id: string; p_request_id: string; p_input: Json; p_create: boolean }; Returns: string };
      get_long_quest_definition_receipt: { Args: { p_request_id: string }; Returns: string | null };
      /** Slice 5: atomically adjust a quantity habit's today progress; auto-crosses complete_habit/undo_habit_completion. */
      increment_habit_progress: {
        Args: { p_habit_id: string; p_date: string; p_delta: number };
        Returns: number;
      };
      initialize_account_time_zone: {
        Args: { p_time_zone: string };
        Returns: string;
      };
      set_account_time_zone: {
        Args: { p_time_zone: string };
        Returns: string;
      };
      ensure_habit_occurrences: {
        Args: { p_through_date: string };
        Returns: undefined;
      };
      get_habits_for_date: {
        Args: { p_date: string };
        Returns: Database['public']['Tables']['habits']['Row'][];
      };
      reconcile_habit_recoveries: {
        Args: Record<string, never>;
        Returns: { open_count: number };
      };
      get_open_habit_recoveries: {
        Args: Record<string, never>;
        Returns: Array<{
          habit_id: string;
          missed_on: string;
          preserved_streak: number;
          opened_at: string;
          deadline_at: string;
          time_zone: string;
        }>;
      };
      complete_habit_recovery: {
        Args: { p_habit_id: string };
        Returns: {
          status: 'recovered' | 'already_recovered' | 'expired' | 'no_open_recovery';
        };
      };
      archive_habit: {
        Args: { p_habit_id: string };
        Returns: undefined;
      };
      restore_habit: {
        Args: { p_habit_id: string };
        Returns: undefined;
      };
      delete_habit: {
        Args: { p_habit_id: string };
        Returns: undefined;
      };
      read_history_range: {
        Args: { p_start_date: string; p_end_date: string };
        Returns: { rows: unknown[] };
      };
      update_profile: {
        Args: { p_display_name: string; p_user_class: string };
        Returns: { displayName: string; userClass: string; timeZone: string | null };
      };
    };
  };
}
