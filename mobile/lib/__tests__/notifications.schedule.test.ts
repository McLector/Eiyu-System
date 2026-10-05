jest.mock('expo-notifications', () => ({
  __esModule: true,
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { CALENDAR: 'calendar', WEEKLY: 'weekly', DATE: 'date' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('scheduled-id'),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { scheduleHabitReminders, scheduleOneTimeReminder } from '../notifications';

const schedule = Notifications.scheduleNotificationAsync as jest.Mock;

describe('reminder content records the lane a tap should open', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('sends a recurring habit reminder to the Daily lane', async () => {
    await scheduleHabitReminders('h1', { name: 'Run', time: '07:00', days: [1] }, 'UTC');
    expect(schedule.mock.calls[0][0].content.data).toEqual({ lane: 'daily' });
  });

  it('sends a one-time reminder to the One-time lane', async () => {
    await scheduleOneTimeReminder('o1', { name: 'Report', time: '09:00', date: '2999-01-01' }, 'UTC');
    expect(schedule.mock.calls[0][0].content.data).toEqual({ lane: 'one-time' });
  });
});
