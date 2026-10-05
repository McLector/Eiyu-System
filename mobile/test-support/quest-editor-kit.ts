import { initialUser, type Quest, type UserProfile } from '@eiyu/shared';

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
};

/** What `useEiyu()` returns to the editor: the account and the four quest writes. */
export function makeEditorStore(quests: Quest[] = []) {
  const user: UserProfile = { ...initialUser, timeZone: 'UTC', rank: 'E', quests, longQuests: [] };
  return {
    user,
    saveHabit: jest.fn().mockResolvedValue(undefined),
    archiveQuest: jest.fn().mockResolvedValue(undefined),
    restoreQuest: jest.fn().mockResolvedValue(undefined),
    deleteQuest: jest.fn().mockResolvedValue(undefined),
  };
}

export type EditorStore = ReturnType<typeof makeEditorStore>;
