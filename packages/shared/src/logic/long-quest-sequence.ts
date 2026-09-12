import type { QuestStage } from '../types/eiyu';

export interface StageSequenceState {
  locked: boolean;
  reason: string | null;
  questComplete: boolean;
}

/** Mirrors the authoritative database rule for immediate, accessible UI feedback. */
export function stageSequenceState(stages: QuestStage[], index: number): StageSequenceState {
  const stage = stages[index];
  const questComplete = stages.length > 0 && stages.every(item => item.done);

  if (!stage) return { locked: true, reason: 'Stage not found.', questComplete };

  if (stage.done) {
    const laterStageDone = stages.slice(index + 1).some(item => item.done);
    return {
      locked: laterStageDone,
      reason: laterStageDone ? 'Complete stages must be undone in reverse order.' : null,
      questComplete,
    };
  }

  const earlierStageIncomplete = stages.slice(0, index).some(item => !item.done);
  return {
    locked: earlierStageIncomplete,
    reason: earlierStageIncomplete ? 'Complete earlier stages first.' : null,
    questComplete,
  };
}
