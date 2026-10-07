export type Stat = 'STR' | 'INT' | 'DEX' | 'WIS' | 'CHA';
export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';
/** Recurring habit, one-time (dated) quest, or a Backlog idea with no date. */
export type QuestType = 'habit' | 'one_time' | 'backlog';
/** What a One-time or Backlog quest is about. Habits have no genre. */
export type QuestGenre = 'tool' | 'concept' | 'article' | 'software_idea' | 'todo';

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
  /** One-time and Backlog quests only; null for habits and untagged quests. */
  genre?: QuestGenre | null;
  /** False when a One-time quest has no set time (the stored time is a placeholder). Defaults to true. */
  timeSet?: boolean;
  /** One-time quests only: the stored "YYYY-MM-DD" scheduled date; null/absent otherwise. */
  scheduledDate?: string | null;
  /** Row creation time, used to list Backlog newest first. */
  createdAt?: string;
  /** Stored manual order within the quest's lane (migration 044); lower comes first. Absent before 044. */
  position?: number;
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
  /** When the chain was created; absent on rows read before the column was selected. */
  createdAt?: string;
  /** False when the stages may be done in any order. Absent (older rows, or the column is not deployed) means in order. */
  strictOrder?: boolean;
  /** Stored manual order in the Chain list (migration 044); lower comes first. Absent before 044. */
  position?: number;
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
