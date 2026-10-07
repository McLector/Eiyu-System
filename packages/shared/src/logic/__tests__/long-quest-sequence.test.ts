import { CHAIN_ORDER_COPY, doneStagesFormPrefix, stageSequenceState } from '../long-quest-sequence';
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

  describe('in any order', () => {
    it('never locks an open stage', () => {
      expect(stages(false, false, false).map((_, i, all) => stageSequenceState(all, i, false).locked)).toEqual([false, false, false]);
      expect(stages(false, true, false).map((_, i, all) => stageSequenceState(all, i, false).locked)).toEqual([false, false, false]);
    });

    it('lets any done stage be undone, whatever follows it', () => {
      const state = stages(true, true, true);
      expect(state.map((_, i) => stageSequenceState(state, i, false))).toEqual([
        { locked: false, reason: null, questComplete: true },
        { locked: false, reason: null, questComplete: true },
        { locked: false, reason: null, questComplete: true },
      ]);
    });

    it('is complete only when every stage is done, wherever the gaps are', () => {
      expect(stageSequenceState(stages(false, true, true), 1, false).questComplete).toBe(false);
      expect(stageSequenceState(stages(true, true, true), 1, false).questComplete).toBe(true);
    });

    it('reports a missing stage', () => {
      expect(stageSequenceState(stages(false), 4, false)).toMatchObject({ locked: true, reason: 'Stage not found.' });
    });
  });

  it('keeps the order rules when the mode is true or not given at all', () => {
    const state = stages(false, false);
    expect(stageSequenceState(state, 1, true).locked).toBe(true);
    expect(stageSequenceState(state, 1, undefined).locked).toBe(true);
  });
});

describe('doneStagesFormPrefix', () => {
  const flags = (...done: boolean[]) => done.map(value => ({ done: value }));

  it('accepts no stages, none done, all done and a done run from the start', () => {
    expect(doneStagesFormPrefix([])).toBe(true);
    expect(doneStagesFormPrefix(flags(false, false))).toBe(true);
    expect(doneStagesFormPrefix(flags(true, true))).toBe(true);
    expect(doneStagesFormPrefix(flags(true, true, false, false))).toBe(true);
  });

  it('refuses a done stage after an open one', () => {
    expect(doneStagesFormPrefix(flags(false, true))).toBe(false);
    expect(doneStagesFormPrefix(flags(true, false, true))).toBe(false);
    expect(doneStagesFormPrefix(flags(true, false, false, true))).toBe(false);
  });
});

describe('CHAIN_ORDER_COPY', () => {
  it('has the one label and the reason both platforms show', () => {
    expect(CHAIN_ORDER_COPY.label).toBe('Stages in order');
    expect(CHAIN_ORDER_COPY.blocked).toBe('Mark the later done stages not done first to keep stages in order.');
    expect(CHAIN_ORDER_COPY.inOrder).toBe('In order');
    expect(CHAIN_ORDER_COPY.anyOrder).toBe('Any order');
  });
});
