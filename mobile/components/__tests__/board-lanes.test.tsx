import { render, screen, userEvent } from '@testing-library/react-native';
import type { Quest, UserProfile } from '@eiyu/shared';
import { initialUser } from '@eiyu/shared';
import BoardScreen from '../../app/(tabs)/board';

const mockRouter = { push: jest.fn() };
let mockStoreValue: any;

jest.mock('expo-router', () => ({ router: mockRouter }));
jest.mock('@/contexts/eiyu-store', () => ({ useEiyu: () => mockStoreValue }));
jest.mock('@/lib/haptics', () => ({ hapticLight: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock('@/components/eiyu/icons', () => ({
  CheckIcon: () => null,
  PlusIcon: () => null,
  SnowflakeIcon: () => null,
  StatIcon: () => null,
}));
jest.mock('@/components/eiyu/divider', () => ({ Divider: () => null }));
jest.mock('@/components/eiyu/ghost-button', () => ({
  GhostButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
    const { Pressable, Text } = jest.requireActual('react-native');
    return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}><Text>{label}</Text></Pressable>;
  },
}));
jest.mock('@/components/eiyu/glass-view', () => ({ GlassView: 'View' }));
jest.mock('@/components/eiyu/page-background', () => ({ PageBackground: () => null }));
jest.mock('@/components/eiyu/screen', () => ({ Screen: 'View' }));

const habit: Quest = {
  id: 'daily', name: 'Daily habit', stat: 'STR', difficulty: 'Medium',
  easyVersion: 'One minute', description: null, questType: 'habit', archived: false,
  time: '08:00', days: [1, 3, 5], streak: 0, frozen: false, dailyEligible: true,
  completed: false, targetCount: null, progressCount: 0,
};

function setup() {
  const quests: Quest[] = [
    habit,
    { ...habit, id: 'off-day', name: 'Off-day habit', dailyEligible: false },
    { ...habit, id: 'archived', name: 'Archived habit', archived: true, dailyEligible: false },
  ];
  const user: UserProfile = { ...initialUser, timeZone: 'UTC', rank: 'E', quests, longQuests: [] };
  mockStoreValue = {
    theme: {
      body: '#000', modal: '#111', overlay: '#000', glassBorder: '#333', handle: '#444', text: '#fff',
      dim: '#999', track: '#222', accentBorder: '#555', accent: '#0ff', muted: '#aaa', accentStrong: '#0ff', accentGlass: '#022',
    },
    user,
    questsLoading: false,
    questsError: null,
    retryQuests: jest.fn(),
    toggleQuest: jest.fn(),
    completeEasy: jest.fn(),
    adjustProgress: jest.fn(),
    completeRecovery: jest.fn(),
    reminderWarning: null,
  };
}

describe('mobile BoardScreen lanes', () => {
  beforeEach(setup);

  it('uses a phone lane selector to reach All Habits and Archived without hiding actions', async () => {
    const user = userEvent.setup();
    await render(<BoardScreen />);

    expect(screen.getByRole('tab', { name: 'DAILY QUEST' })).toBeOnTheScreen();
    expect(screen.getByText('Daily habit')).toBeOnTheScreen();
    expect(screen.queryByText('Off-day habit')).not.toBeOnTheScreen();

    await user.press(screen.getByRole('tab', { name: 'ALL HABITS' }));
    expect(screen.getByText('Off-day habit')).toBeOnTheScreen();
    expect(screen.queryByText('Archived habit')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Edit Off-day habit' })).toBeOnTheScreen();

    await user.press(screen.getByRole('tab', { name: 'ARCHIVED' }));
    expect(screen.getByText('Archived habit')).toBeOnTheScreen();
    expect(screen.queryByText('Off-day habit')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Edit Archived habit' })).toBeOnTheScreen();
  });
});
