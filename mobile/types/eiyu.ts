export type Stat = 'STR' | 'INT' | 'DEX' | 'WIS' | 'CHA';
export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';
/** Recurring habit vs one-time (today-only) quest (improvement-pass #7). */
export type QuestType = 'habit' | 'one_time';

export interface StatData {
  level: number;
  xp: number;
  xpMax: number;
}

export interface Quest {
  id: string;
  name: string;
  stat: Stat;
  difficulty: Difficulty;
  /** One-time quests have no easy/recovery version (binary done/not-done). */
  easyVersion: string | null;
  /** Optional note attached to the quest (improvement-pass #8). */
  description: string | null;
  questType: QuestType;
  time: string;
  days: number[];
  streak: number;
  frozen: boolean;
  frozenHoursLeft?: number;
  /** the missed date to backdate a recovery completion to (R-13); set iff frozen */
  frozenDate?: string;
  completed: boolean;
}

export interface QuestStage {
  id: string;
  name: string;
  done: boolean;
}

export interface LongQuest {
  id: string;
  name: string;
  stat: Stat;
  stages: QuestStage[];
}

export interface UserProfile {
  name: string;
  userClass: string;
  rank: Rank;
  stats: Record<Stat, StatData>;
  quests: Quest[];
  longQuests: LongQuest[];
}
