// Hand-written to match backend/supabase/*.sql. Regenerate with
// `supabase gen types typescript` once the CLI is wired into this project;
// until then, keep this in sync with the migrations by hand.

export type StatKey = 'STR' | 'INT' | 'DEX' | 'WIS' | 'CHA';
export type DifficultyKey = 'Easy' | 'Medium' | 'Hard';
export type CompletionKind = 'full' | 'easy';
export type ThemeKey = 'dark' | 'light';

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
          easy_version: string;
          stat: StatKey;
          difficulty: DifficultyKey;
          reminder_time: string;
          days: number[];
          archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['habits']['Row']> & {
          user_id: string;
          name: string;
          easy_version: string;
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
    };
    Views: Record<string, never>;
    Functions: {
      increment_stat_xp: {
        Args: { p_stat: StatKey; p_delta: number };
        Returns: undefined;
      };
    };
  };
}
