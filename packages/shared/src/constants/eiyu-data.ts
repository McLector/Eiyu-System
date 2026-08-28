import { Rank, Stat, UserProfile } from '../types/eiyu';

export const STAT_COLORS: Record<Stat, string> = {
  STR: '#f87171',
  INT: '#60a5fa',
  DEX: '#fbbf24',
  WIS: '#c084fc',
  CHA: '#fb923c',
};

export const RANK_CONFIG: Record<Rank, { color: string; bg: string; glow: string }> = {
  S: { color: '#ffd700', bg: 'rgba(255,215,0,0.14)', glow: 'rgba(255,215,0,0.45)' },
  A: { color: '#e879f9', bg: 'rgba(232,121,249,0.14)', glow: 'rgba(232,121,249,0.4)' },
  B: { color: '#60a5fa', bg: 'rgba(96,165,250,0.14)', glow: 'rgba(96,165,250,0.4)' },
  C: { color: '#4ade80', bg: 'rgba(74,222,128,0.14)', glow: 'rgba(74,222,128,0.4)' },
  D: { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', glow: 'rgba(148,163,184,0.3)' },
  E: { color: '#64748b', bg: 'rgba(100,116,139,0.08)', glow: 'rgba(100,116,139,0.2)' },
};

export const STATS: Stat[] = ['STR', 'INT', 'DEX', 'WIS', 'CHA'];

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Fallback shown only before the real profile/stats load — never quests or long quests, those are real from first render. */
export const initialUser: Pick<UserProfile, 'name' | 'userClass' | 'stats'> = {
  name: 'Adventurer',
  userClass: '',
  stats: {
    STR: { level: 1, xp: 0, xpMax: 100 },
    INT: { level: 1, xp: 0, xpMax: 100 },
    DEX: { level: 1, xp: 0, xpMax: 100 },
    WIS: { level: 1, xp: 0, xpMax: 100 },
    CHA: { level: 1, xp: 0, xpMax: 100 },
  },
};
