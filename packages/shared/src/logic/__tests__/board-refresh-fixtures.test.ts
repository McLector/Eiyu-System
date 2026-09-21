import { partitionBoardQuests } from '../quest-recurrence';
import {
  BOARD_REFRESH_FIXTURE_DATE,
  BOARD_REFRESH_FIXTURE_USERS,
  createBoardRefreshFixtureSet,
  questsByFixtureLabel,
} from '../../test-support/board-refresh-fixtures';

describe('board refresh characterization fixtures', () => {
  it('covers every Phase 0 fixture category with deterministic values', () => {
    const fixtures = createBoardRefreshFixtureSet();
    const labels = fixtures.primary.quests.map(quest => quest.fixtureLabel);

    expect(fixtures.dateKey).toBe(BOARD_REFRESH_FIXTURE_DATE);
    expect(new Set(labels)).toEqual(
      new Set([
        'active-due',
        'active-off-day',
        'quantity-due',
        'one-time-pending',
        'one-time-completed',
        'archived-recurring',
        'archived-one-time',
        'recovery-open',
        'long-name',
      ])
    );
    expect(fixtures.primary.quests).toHaveLength(9);
    expect(fixtures.secondary.quests).toHaveLength(1);
  });

  it('keeps owner IDs isolated and produces fresh fixture objects per call', () => {
    const first = createBoardRefreshFixtureSet();
    const second = createBoardRefreshFixtureSet();

    expect(first.primary.quests.every(quest => quest.ownerId === BOARD_REFRESH_FIXTURE_USERS.primary)).toBe(true);
    expect(first.secondary.quests.every(quest => quest.ownerId === BOARD_REFRESH_FIXTURE_USERS.secondary)).toBe(true);
    expect(first.primary.quests.some(quest => quest.ownerId === first.secondary.userId)).toBe(false);
    expect(first.primary.quests).not.toBe(second.primary.quests);
    expect(first.primary.quests[0]).not.toBe(second.primary.quests[0]);

    first.primary.quests[0].name = 'Mutated in this case';
    first.primary.quests[1].days.push(4);

    expect(second.primary.quests[0].name).toBe('Morning walk');
    expect(second.primary.quests[1].days).toEqual([2]);
    expect(second.secondary.quests[0].name).toBe('Other account habit');
  });

  it('characterizes the current shared board partition for the mixed fixture', () => {
    const fixtures = createBoardRefreshFixtureSet();
    const sections = partitionBoardQuests(fixtures.primary.quests);
    const labelFor = (id: string) =>
      fixtures.primary.quests.find(quest => quest.id === id)?.fixtureLabel;
    const labelsFor = (ids: string[]) => ids.map(labelFor);

    expect(labelsFor(sections.dailyQuests.map(quest => quest.id))).toEqual([
      'active-due',
      'quantity-due',
      'long-name',
    ]);
    expect(labelsFor(sections.recoveryRequired.map(quest => quest.id))).toEqual(['recovery-open']);
    expect(labelsFor(sections.oneTimeQuests.map(quest => quest.id))).toEqual([
      'one-time-pending',
      'one-time-completed',
      'archived-one-time',
    ]);

    // Characterization of the pre-refresh implementation: Phase 3 will make
    // allHabits active-only and provide a dedicated archivedQuests lane.
    expect(labelsFor(sections.allHabits.map(quest => quest.id))).toEqual([
      'active-due',
      'active-off-day',
      'quantity-due',
      'archived-recurring',
      'recovery-open',
      'long-name',
    ]);
  });

  it('keeps quantity, recovery, archive, and long-name fields observable to later tests', () => {
    const fixtures = createBoardRefreshFixtureSet();
    const quantity = questsByFixtureLabel(fixtures.primary.quests, 'quantity-due')[0];
    const recovery = questsByFixtureLabel(fixtures.primary.quests, 'recovery-open')[0];
    const archived = questsByFixtureLabel(fixtures.primary.quests, 'archived-recurring')[0];
    const longName = questsByFixtureLabel(fixtures.primary.quests, 'long-name')[0];

    expect(quantity).toMatchObject({ targetCount: 3, progressCount: 1 });
    expect(recovery).toMatchObject({
      days: [0],
      frozen: true,
      frozenDate: '2026-09-13',
      recoveryDeadline: '2026-09-15T00:00:00.000Z',
      streak: 4,
    });
    expect(archived).toMatchObject({ archived: true, dailyEligible: false });
    expect(longName.name.length).toBeGreaterThan(80);
  });
});
