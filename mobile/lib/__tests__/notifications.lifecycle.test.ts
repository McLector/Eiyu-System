jest.mock('expo-notifications', () => ({
  __esModule: true,
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { CALENDAR: 'calendar', WEEKLY: 'weekly', DATE: 'date' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('scheduled-id'),
}));
jest.mock('react-native', () => {
  return { Platform: { OS: 'ios' } };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { inspectNotificationPermissions, requestNotificationPermissions, cancelHabitReminders } from '../notifications';

const mockNotifications = Notifications as any;

describe('lifecycle reminder boundaries', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('cancels every reminder owned by an archived/deleted quest', async () => {
    await AsyncStorage.setItem('eiyu:notification-ids', JSON.stringify({ 'habit-1': ['os-1', 'os-2'] }));

    await cancelHabitReminders('habit-1');

    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('os-1');
    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('os-2');
    expect(await AsyncStorage.getItem('eiyu:notification-ids')).toBe('{}');
  });

  it('reports unavailable permission as false instead of throwing', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false });
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ granted: false });

    await expect(requestNotificationPermissions()).resolves.toBe(false);
    expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['granted', { granted: true }, true],
    ['denied', { granted: false, canAskAgain: false }, false],
    ['undetermined', { granted: false, canAskAgain: true }, false],
  ])('inspects %s permission without prompting the operating system', async (_state, result, expected) => {
    mockNotifications.getPermissionsAsync.mockResolvedValue(result);

    await expect(inspectNotificationPermissions()).resolves.toBe(expected);
    expect(mockNotifications.getPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
