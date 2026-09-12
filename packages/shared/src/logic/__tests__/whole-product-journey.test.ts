import {
  LEGAL_DOCUMENTS,
  isRecurringHabitEligible,
  normalizeStageDescription,
  partitionBoardQuests,
  stageSequenceState,
  streakStateFromOccurrences,
} from '../../index';
import type { Quest, QuestStage } from '../../types/eiyu';

const TIME_ZONE = 'Asia/Manila';
const MWF = [1, 3, 5];

function habit(overrides: Partial<Quest> = {}): Quest {
  return {
    id: 'habit-mwf',
    name: 'Train consistently',
    stat: 'STR',
    difficulty: 'Medium',
    easyVersion: 'Penalty: train for five minutes',
    description: null,
    questType: 'habit',
    time: '08:00',
    days: MWF,
    streak: 0,
    frozen: false,
    completed: false,
    targetCount: null,
    progressCount: 0,
    ...overrides,
  };
}

function stages(done: boolean[] = [false, false, false]): QuestStage[] {
  return [
    { id: 'stage-1', name: 'Plan', done: done[0], description: normalizeStageDescription('  Define the route.  ') },
    { id: 'stage-2', name: 'Build', done: done[1], description: normalizeStageDescription('Build\nacross platforms') },
    { id: 'stage-3', name: 'Ship', done: done[2], description: normalizeStageDescription(undefined) },
  ];
}

describe('whole-product fresh-account journey', () => {
  it('keeps registration documents, quest types, recovery, and long-quest progression consistent', () => {
    // Registration exposes two independent, populated documents before any quest data exists.
    expect(Object.values(LEGAL_DOCUMENTS).map(document => document.title)).toEqual([
      'Privacy Policy',
      'Terms of Use',
    ]);
    expect(Object.values(LEGAL_DOCUMENTS).every(document => document.sections.length > 0)).toBe(true);

    const oneTime = habit({
      id: 'one-time',
      name: 'Book an appointment',
      questType: 'one_time',
      easyVersion: null,
      days: [],
      dailyEligible: true,
    });

    // On Monday, the scheduled habit and the one-time quest occupy distinct lists.
    expect(isRecurringHabitEligible(MWF, '2026-09-07', '2026-09-07')).toBe(true);
    const mondayHabit = habit({ dailyEligible: true });
    const mondayBoard = partitionBoardQuests([mondayHabit, oneTime]);
    expect(mondayBoard.dailyQuests.map(quest => quest.id)).toEqual(['habit-mwf']);
    expect(mondayBoard.oneTimeQuests.map(quest => quest.id)).toEqual(['one-time']);
    expect(mondayBoard.allHabits[0]).toBe(mondayBoard.dailyQuests[0]);

    // Tuesday is an off-day: the definition remains in All Habits while recovery is separate.
    expect(isRecurringHabitEligible(MWF, '2026-09-07', '2026-09-08')).toBe(false);
    const tuesdayHabit = habit({
      dailyEligible: false,
      frozen: true,
      frozenDate: '2026-09-07',
      recoveryTimeZone: TIME_ZONE,
    });
    const tuesdayBoard = partitionBoardQuests([tuesdayHabit, { ...oneTime, completed: true }]);
    expect(tuesdayBoard.dailyQuests).toEqual([]);
    expect(tuesdayBoard.recoveryRequired).toEqual([tuesdayHabit]);
    expect(tuesdayBoard.allHabits).toEqual([tuesdayHabit]);
    expect(tuesdayBoard.oneTimeQuests[0]).toMatchObject({ id: 'one-time', completed: true });

    const occurrences = new Set(['2026-09-07', '2026-09-09', '2026-09-11']);
    const duringRecovery = new Date('2026-09-08T08:00:00.000Z'); // 16:00 Tuesday in Manila
    expect(streakStateFromOccurrences(occurrences, new Set(), duringRecovery, TIME_ZONE)).toMatchObject({
      current: 0,
      state: 'frozen',
      frozenDate: '2026-09-07',
    });

    // Recovering the missed occurrence restores normal state; later expiry resets and unfreezes.
    expect(
      streakStateFromOccurrences(occurrences, new Set(['2026-09-07']), duringRecovery, TIME_ZONE)
    ).toEqual({ current: 1, state: 'active' });
    expect(
      streakStateFromOccurrences(
        occurrences,
        new Set(['2026-09-07']),
        new Date('2026-09-12T08:00:00.000Z'),
        TIME_ZONE
      )
    ).toEqual({ current: 0, state: 'broken' });

    // A normal completion today never hides the separate recovery obligation.
    const simultaneous = partitionBoardQuests([
      habit({ dailyEligible: true, completed: true, frozen: true, frozenDate: '2026-09-09' }),
    ]);
    expect(simultaneous.dailyQuests).toHaveLength(1);
    expect(simultaneous.recoveryRequired).toHaveLength(1);
    expect(simultaneous.dailyQuests[0]).toBe(simultaneous.recoveryRequired[0]);

    // Long quests remain a separate ordered model with optional descriptions.
    const initialStages = stages();
    expect(initialStages.map(stage => stage.description)).toEqual([
      'Define the route.',
      'Build\nacross platforms',
      null,
    ]);
    expect(initialStages.map((_, index) => stageSequenceState(initialStages, index).locked)).toEqual([
      false,
      true,
      true,
    ]);
    expect(stageSequenceState(initialStages, 2).reason).toBe('Complete earlier stages first.');

    const afterStageOne = stages([true, false, false]);
    expect(stageSequenceState(afterStageOne, 1).locked).toBe(false);
    expect(stageSequenceState(afterStageOne, 2).locked).toBe(true);

    const completedStages = stages([true, true, true]);
    expect(stageSequenceState(completedStages, 2)).toMatchObject({
      locked: false,
      questComplete: true,
    });
  });
});
