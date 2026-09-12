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
  /** Catalog lifecycle state; archived habits remain visible in All Habits. */
  archived?: boolean;
  time: string;
  days: number[];
  streak: number;
  frozen: boolean;
  frozenHoursLeft?: number;
  /** Missed product date owned by the authoritative recovery window. */
  frozenDate?: string;
  /** False when this quest is present only because recovery is open today. */
  dailyEligible?: boolean;
  /** Absolute persisted recovery deadline. */
  recoveryDeadline?: string;
  /** IANA timezone in which the missed occurrence and deadline were created. */
  recoveryTimeZone?: string;
  completed: boolean;
  /** Quantity-habit target; null = ordinary binary habit (Slice 5). */
  targetCount: number | null;
  /** Today's progress toward targetCount; 0 when not a quantity habit or no progress yet (Slice 5). */
  progressCount: number;
}

export interface QuestStage {
  id: string;
  name: string;
  done: boolean;
  description: string | null;
}

export interface LongQuest {
  id: string;
  name: string;
  stat: Stat;
  description: string | null;
  /** Immutable timestamp of the first time every stage was completed. */
  completedAt: string | null;
  stages: QuestStage[];
}

export interface UserProfile {
  name: string;
  userClass: string;
  /** Persisted IANA timezone defining this account's product-day midnight. */
  timeZone: string;
  rank: Rank;
  stats: Record<Stat, StatData>;
  quests: Quest[];
  longQuests: LongQuest[];
}
