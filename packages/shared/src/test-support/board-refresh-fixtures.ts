import type { Quest } from '../types/eiyu';

/**
 * Deterministic, account-isolated data for board-refresh characterization and
 * the later lifecycle/board acceptance suites. These fixtures stay in the
 * test-support tree so they cannot become a production data seed.
 */
export const BOARD_REFRESH_FIXTURE_DATE = '2026-09-14'; // Monday in UTC.

export const BOARD_REFRESH_FIXTURE_USERS = {
  primary: '11111111-1111-4111-8111-111111111111',
  secondary: '22222222-2222-4222-8222-222222222222',
} as const;

export type BoardRefreshFixtureLabel =
  | 'active-due'
  | 'active-off-day'
  | 'quantity-due'
  | 'one-time-pending'
  | 'one-time-completed'
  | 'archived-recurring'
  | 'archived-one-time'
  | 'recovery-open'
  | 'long-name';

export type BoardRefreshQuest = Quest & {
  ownerId: string;
  fixtureLabel: BoardRefreshFixtureLabel;
};

export interface BoardRefreshAccountFixture {
  userId: string;
  timeZone: string;
  quests: BoardRefreshQuest[];
}

export interface BoardRefreshFixtureSet {
  dateKey: string;
  primary: BoardRefreshAccountFixture;
  secondary: BoardRefreshAccountFixture;
}

const baseQuest = (
  ownerId: string,
  id: string,
  fixtureLabel: BoardRefreshFixtureLabel,
  overrides: Partial<Quest> = {}
): BoardRefreshQuest => ({
  id,
  ownerId,
  fixtureLabel,
  name: 'Fixture quest',
  stat: 'STR',
  difficulty: 'Medium',
  easyVersion: 'Do one minute',
  description: null,
  questType: 'habit',
  archived: false,
  time: '08:00',
  days: [1, 3, 5],
  streak: 0,
  frozen: false,
  dailyEligible: true,
  completed: false,
  targetCount: null,
  progressCount: 0,
  ...overrides,
});

function quest(
  ownerId: string,
  id: string,
  fixtureLabel: BoardRefreshFixtureLabel,
  name: string,
  overrides: Partial<Quest> = {}
): BoardRefreshQuest {
  return baseQuest(ownerId, id, fixtureLabel, { name, ...overrides });
}

function primaryFixtures(): BoardRefreshQuest[] {
  const ownerId = BOARD_REFRESH_FIXTURE_USERS.primary;
  return [
    quest(ownerId, 'refresh-active-due', 'active-due', 'Morning walk'),
    quest(ownerId, 'refresh-active-off-day', 'active-off-day', 'Tuesday planning', {
      days: [2],
      dailyEligible: false,
    }),
    quest(ownerId, 'refresh-quantity-due', 'quantity-due', 'Drink water', {
      stat: 'INT',
      targetCount: 3,
      progressCount: 1,
    }),
    quest(ownerId, 'refresh-one-time-pending', 'one-time-pending', 'Book appointment', {
      questType: 'one_time',
      easyVersion: null,
      days: [],
      dailyEligible: true,
    }),
    quest(ownerId, 'refresh-one-time-completed', 'one-time-completed', 'Send application', {
      questType: 'one_time',
      easyVersion: null,
      days: [],
      dailyEligible: true,
      completed: true,
    }),
    quest(ownerId, 'refresh-archived-recurring', 'archived-recurring', 'Archived journal', {
      archived: true,
      dailyEligible: false,
    }),
    quest(ownerId, 'refresh-archived-one-time', 'archived-one-time', 'Archived appointment', {
      questType: 'one_time',
      easyVersion: null,
      days: [],
      archived: true,
      dailyEligible: false,
    }),
    quest(ownerId, 'refresh-recovery-open', 'recovery-open', 'Recover yesterday', {
      days: [0],
      dailyEligible: false,
      frozen: true,
      frozenDate: '2026-09-13',
      recoveryDeadline: '2026-09-15T00:00:00.000Z',
      recoveryTimeZone: 'UTC',
      streak: 4,
    }),
    quest(
      ownerId,
      'refresh-long-name',
      'long-name',
      'A very long habit name that must wrap without hiding actions or changing its identity',
      { stat: 'WIS', difficulty: 'Hard', description: 'A long description for expansion checks.' }
    ),
  ];
}

function secondaryFixtures(): BoardRefreshQuest[] {
  const ownerId = BOARD_REFRESH_FIXTURE_USERS.secondary;
  return [
    quest(ownerId, 'refresh-secondary-due', 'active-due', 'Other account habit', {
      stat: 'DEX',
    }),
  ];
}

/** Return fresh objects on every call so tests cannot leak mutations between accounts or cases. */
export function createBoardRefreshFixtureSet(): BoardRefreshFixtureSet {
  return {
    dateKey: BOARD_REFRESH_FIXTURE_DATE,
    primary: {
      userId: BOARD_REFRESH_FIXTURE_USERS.primary,
      timeZone: 'UTC',
      quests: primaryFixtures(),
    },
    secondary: {
      userId: BOARD_REFRESH_FIXTURE_USERS.secondary,
      timeZone: 'Asia/Manila',
      quests: secondaryFixtures(),
    },
  };
}

export function questsByFixtureLabel(
  quests: BoardRefreshQuest[],
  fixtureLabel: BoardRefreshFixtureLabel
): BoardRefreshQuest[] {
  return quests.filter(quest => quest.fixtureLabel === fixtureLabel);
}
