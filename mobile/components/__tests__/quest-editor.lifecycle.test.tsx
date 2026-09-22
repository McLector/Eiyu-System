import { cleanup, render, screen, userEvent } from '@testing-library/react-native';
import type { Quest, UserProfile } from '@eiyu/shared';
import { initialUser } from '@eiyu/shared';

const mockRouter = { back: jest.fn() };
let mockSearchParams: { id?: string } = {};
let mockStoreValue: any;

jest.mock('expo-router', () => ({ router: mockRouter, useLocalSearchParams: () => mockSearchParams }));
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStoreValue }));
jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    KeyboardAwareScrollView: ({ children, ...props }: { children: unknown; [key: string]: unknown }) =>
      React.createElement(View, props, children),
  };
});
jest.mock('@/components/eiyu/screen', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Screen: ({ children, ...props }: { children: unknown; [key: string]: unknown }) => React.createElement(View, props, children) };
});

import QuestEditorScreen from '../../app/quest-editor';

const habit: Quest = {
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

function setup(quest: Quest = habit) {
  mockSearchParams = { id: quest.id };
  const user: UserProfile = { ...initialUser, timeZone: 'UTC', rank: 'E', quests: [quest], longQuests: [] };
  const value = {
    theme: {
      overlay: '#000', modal: '#111', glassBorder: '#333', handle: '#444', text: '#fff', dim: '#999',
      track: '#222', accentBorder: '#555', accent: '#0ff', muted: '#aaa', accentStrong: '#0ff', accentGlass: '#022',
    },
    user,
    saveHabit: jest.fn().mockResolvedValue(undefined),
    archiveQuest: jest.fn().mockResolvedValue(undefined),
    restoreQuest: jest.fn().mockResolvedValue(undefined),
    deleteQuest: jest.fn().mockResolvedValue(undefined),
  };
  mockStoreValue = value;
  return value;
}

describe('mobile QuestEditor lifecycle controls', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
    mockStoreValue = undefined;
  });

  it('archives active quests through archive only', async () => {
    const value = setup();
    const user = userEvent.setup();
    await render(<QuestEditorScreen />);

    await user.press(screen.getByRole('button', { name: 'ARCHIVE QUEST' }));

    expect(value.archiveQuest).toHaveBeenCalledWith('habit-1');
    expect(value.deleteQuest).not.toHaveBeenCalled();
  });

  it('keeps Cancel side-effect free and confirms permanent delete separately', async () => {
    const value = setup();
    const user = userEvent.setup();
    await render(<QuestEditorScreen />);

    await user.press(screen.getByRole('button', { name: 'DELETE PERMANENTLY' }));
    expect(screen.getByText('DELETE QUEST PERMANENTLY?')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(value.deleteQuest).not.toHaveBeenCalled();

    await user.press(screen.getByRole('button', { name: 'DELETE PERMANENTLY' }));
    await user.press(screen.getByRole('button', { name: 'Confirm permanent delete' }));
    expect(value.deleteQuest).toHaveBeenCalledWith('habit-1');
    expect(value.archiveQuest).not.toHaveBeenCalled();
  });

  it('shows Restore and Delete for archived quests, without a completion control', async () => {
    const value = setup({ ...habit, archived: true });
    const user = userEvent.setup();
    await render(<QuestEditorScreen />);

    expect(screen.getByRole('button', { name: 'RESTORE QUEST' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'DELETE PERMANENTLY' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Complete|Undo/ })).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'RESTORE QUEST' }));
    expect(value.restoreQuest).toHaveBeenCalledWith('habit-1');
  });
});
