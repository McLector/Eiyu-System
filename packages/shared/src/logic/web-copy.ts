import { formatError } from './format-error';

/**
 * Hunter-voice copy for the web Gym, Long Quest, navigation-guard and weekly-review
 * states. Lives in shared/ for the same reason as auth-copy: it can be unit-tested
 * without the web app's module graph, and mobile can reuse the exact same lines.
 * Voice rules: errors speak as the System, name the cause after an em dash, and never
 * leak internals (no "reconciled", "payload" or "refresh failed").
 */

export const GYM_COPY = {
  loadingHistory: 'Reading the training log…',
  emptyHistory: 'No workouts on record. Finish one and it appears here.',
  noRoutine: 'No routine yet. Create one, then add its exercises.',
  refreshFailed: "The System couldn't refresh. Your saved progress is safe.",
  confirmSave: 'Confirm save result',
  uploadHeld: 'Your upload is held until the save is confirmed.',
} as const;

/** "<what>. The System couldn't refresh — <cause>" for a save that succeeded but whose reload failed. */
export function gymSavedRefreshFailed(what: string, err: unknown): string {
  return `${what}. The System couldn't refresh — ${formatError(err)}`;
}

/** The word "cleanup" is the marker the Gym uses to offer its retry button; keep it in every such line. */
const CLEANUP_MARKER = 'cleanup';

export function gymCleanupPending(err: unknown, lead?: string): string {
  const line = `A demonstration file is still waiting for ${CLEANUP_MARKER} — ${formatError(err)}`;
  return lead ? `${lead}. ${line}` : line;
}

export function isGymCleanupNotice(message: string | null | undefined): boolean {
  return !!message && message.toLowerCase().includes(CLEANUP_MARKER);
}

export const LONG_QUEST_COPY = {
  emptyTitle: 'NO LONG QUESTS',
  empty: 'No quests on record. Chart your first multi-stage quest.',
} as const;

export type StageOutcome = 'replayed' | 'completed' | 'undone' | 'unchanged';
export function stageNotice(outcome: StageOutcome): string {
  switch (outcome) {
    case 'replayed': return 'Stage confirmed.';
    case 'completed': return 'Stage completed.';
    case 'undone': return 'Stage undone.';
    case 'unchanged': return 'Stage already saved.';
  }
}

export const NAVIGATION_GUARD_COPY = {
  leaveTitle: 'Unsaved changes',
  leaveBody: 'Leave without saving? Unsaved changes will be lost. Your last saved version stays.',
  busyTitle: 'Save in progress',
  busyBody: 'Wait for the System to confirm the save before leaving.',
} as const;

export const WEEKLY_REVIEW_COPY = {
  error: "The System couldn't read this week's data.",
} as const;
