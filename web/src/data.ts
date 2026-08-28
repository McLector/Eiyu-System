import { UserProfile, Rank } from './types';

export const STAT_COLORS: Record<string, string> = {
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

export const STATS: Array<import('./types').Stat> = ['STR', 'INT', 'DEX', 'WIS', 'CHA'];

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const initialUser: UserProfile = {
  name: 'Kaito Mizuru',
  userClass: 'Developer',
  rank: 'C',
  stats: {
    STR: { level: 12, xp: 340, xpMax: 500 },
    INT: { level: 28, xp: 720, xpMax: 1000 },
    DEX: { level: 15, xp: 210, xpMax: 400 },
    WIS: { level: 22, xp: 890, xpMax: 1200 },
    CHA: { level: 9, xp: 80, xpMax: 300 },
  },
  quests: [
    {
      id: 'q1', name: 'Code for 2 hours', stat: 'INT',
      difficulty: 'Hard', easyVersion: 'Code for 30 minutes',
      time: '09:00', days: [1, 2, 3, 4, 5],
      streak: 14, frozen: false, completed: true,
    },
    {
      id: 'q2', name: 'Morning run (5 km)', stat: 'STR',
      difficulty: 'Medium', easyVersion: 'Walk for 10 minutes',
      time: '06:30', days: [0, 1, 2, 3, 4, 5, 6],
      streak: 7, frozen: false, completed: false,
    },
    {
      id: 'q3', name: 'Read 30 pages', stat: 'WIS',
      difficulty: 'Medium', easyVersion: 'Read 5 pages',
      time: '21:00', days: [0, 1, 2, 3, 4, 5, 6],
      streak: 3, frozen: true, frozenHoursLeft: 18, completed: false,
    },
    {
      id: 'q4', name: 'Meditate 15 minutes', stat: 'WIS',
      difficulty: 'Easy', easyVersion: 'Take 10 deep breaths',
      time: '07:00', days: [0, 1, 2, 3, 4, 5, 6],
      streak: 21, frozen: false, completed: false,
    },
    {
      id: 'q5', name: 'Reach out to someone', stat: 'CHA',
      difficulty: 'Easy', easyVersion: 'Send a voice message',
      time: '18:00', days: [1, 3, 5],
      streak: 5, frozen: false, completed: false,
    },
  ],
  longQuests: [
    {
      id: 'lq1', name: 'Ship a Side Project', stat: 'INT',
      stages: [
        { name: 'Define the concept', done: true },
        { name: 'Build an MVP', done: true },
        { name: 'Write the landing page', done: false },
        { name: 'Launch on Product Hunt', done: false },
        { name: 'Reach 10 active users', done: false },
      ],
    },
    {
      id: 'lq2', name: 'Run a 10K Race', stat: 'STR',
      stages: [
        { name: 'Run 2K without stopping', done: true },
        { name: 'Complete a 5K', done: false },
        { name: 'Run 8K continuously', done: false },
        { name: 'Register for a race', done: false },
        { name: 'Cross the finish line', done: false },
      ],
    },
    {
      id: 'lq3', name: 'Read 20 Books This Year', stat: 'WIS',
      stages: [
        { name: '5 books completed', done: true },
        { name: '10 books completed', done: true },
        { name: '15 books completed', done: false },
        { name: '20 books completed', done: false },
      ],
    },
  ],
};
