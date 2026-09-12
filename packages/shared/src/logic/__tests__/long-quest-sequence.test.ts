import { stageSequenceState } from '../long-quest-sequence';
import type { QuestStage } from '../../types/eiyu';

const stages = (...done: boolean[]): QuestStage[] => done.map((value, index) => ({
  id: `stage-${index + 1}`,
  name: `Stage ${index + 1}`,
  done: value,
  description: null,
}));

describe('stageSequenceState', () => {
  it('unlocks only Stage 1 initially, then the next incomplete stage', () => {
    expect(stages(false, false, false).map((_, i, all) => stageSequenceState(all, i).locked)).toEqual([
      false, true, true,
    ]);
    expect(stages(true, false, false).map((_, i, all) => stageSequenceState(all, i).locked)).toEqual([
      false, false, true,
    ]);
  });

  it('prevents undoing a completed predecessor while a later stage is done', () => {
    const state = stages(true, true, false);
    expect(stageSequenceState(state, 0)).toMatchObject({ locked: true, reason: 'Complete stages must be undone in reverse order.' });
    expect(stageSequenceState(state, 1)).toMatchObject({ locked: false });
  });

  it('identifies a complete quest only when every required stage is done', () => {
    expect(stageSequenceState(stages(true, true), 1).questComplete).toBe(true);
    expect(stageSequenceState(stages(true, false), 1).questComplete).toBe(false);
  });
});
