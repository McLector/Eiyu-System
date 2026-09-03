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
      profiles: {
        Row: {
          user_id: string;
          display_name: string;
          user_class: string;
          target_role: string | null;
          theme: ThemeKey;
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
        };
        Insert: Partial<Omit<Database['public']['Tables']['habits']['Row'], 'user_id'>> & {
          user_id: string;
          name: string;
          stat: StatKey;
        };
        Update: Partial<Database['public']['Tables']['habits']['Row']>;
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
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['streaks']['Row']> & {
          habit_id: string;
          user_id: string;
        };
        Update: Partial<Database['public']['Tables']['streaks']['Row']>;
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
    };
  };
}
