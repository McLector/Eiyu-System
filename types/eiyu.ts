export type Stat = 'STR' | 'INT' | 'DEX' | 'WIS' | 'CHA';
export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

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
  easyVersion: string;
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
