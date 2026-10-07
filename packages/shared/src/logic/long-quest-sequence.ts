import type { QuestStage } from '../types/eiyu';

export interface StageSequenceState {
  locked: boolean;
  reason: string | null;
  questComplete: boolean;
}

/** Words both platforms use for a chain's order mode. */
export const CHAIN_ORDER_COPY = {
  label: 'Stages in order',
  hintOn: 'Each stage unlocks after the one before it.',
  hintOff: 'Stages can be done in any order.',
  blocked: 'Mark the later done stages not done first to keep stages in order.',
  inOrder: 'In order',
  anyOrder: 'Any order',
} as const;

/**
 * Mirrors the authoritative database rule for immediate, accessible UI feedback.
 * `strictOrder` false (a chain done in any order) never locks a stage; absent means in order.
 */
export function stageSequenceState(stages: QuestStage[], index: number, strictOrder: boolean = true): StageSequenceState {
  const stage = stages[index];
  const questComplete = stages.length > 0 && stages.every(item => item.done);

  if (!stage) return { locked: true, reason: 'Stage not found.', questComplete };
  if (!strictOrder) return { locked: false, reason: null, questComplete };

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

/** True when no done stage follows an open one, the condition for keeping (or returning to) in-order stages. */
export function doneStagesFormPrefix(stages: ReadonlyArray<{ done: boolean }>): boolean {
  let openSeen = false;
  for (const stage of stages) {
    if (!stage.done) openSeen = true;
    else if (openSeen) return false;
  }
  return true;
}
