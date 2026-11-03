import { initialUser, type Quest, type TrackerAccess, type UserProfile } from '@eiyu/shared';

import { trackerAccess } from './tracker-fixtures';

/** A recurring habit with every field the editor reads; tests override what they care about. */
export const habitQuest: Quest = {
  id: 'habit-1',
  name: 'Morning walk',
  stat: 'STR',
  difficulty: 'Medium',
  easyVersion: 'Walk for one minute',
  description: null,
  questType: 'habit',
  archived: false,
  time: '08:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  streak: 2,
  frozen: false,
  completed: false,
  targetCount: null,
  progressCount: 0,
  // Classified and writable, as the server reports a custom quest once custom permission is held.
  inputKind: 'custom',
  canWrite: true,
};

/** What `useEiyu()` returns to the editor: the account, the loaded tracker capability and the quest writes. */
export function makeEditorStore(quests: Quest[] = [], tracker: TrackerAccess | null = trackerAccess(), backlog: Quest[] = []) {
  const user: UserProfile = { ...initialUser, timeZone: 'UTC', rank: 'E', quests, longQuests: [] };
  return {
    user,
    backlog,
    tracker,
    acceptTracker: jest.fn(),
    refreshTracker: jest.fn().mockResolvedValue(undefined),
    saveHabit: jest.fn().mockResolvedValue(undefined),
    archiveQuest: jest.fn().mockResolvedValue(undefined),
    restoreQuest: jest.fn().mockResolvedValue(undefined),
    deleteQuest: jest.fn().mockResolvedValue(undefined),
  };
}

export type EditorStore = ReturnType<typeof makeEditorStore>;
