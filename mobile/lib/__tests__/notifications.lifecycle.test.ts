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
import { inspectNotificationPermissions, notificationPermissionNeverAsked, requestNotificationPermissions, cancelHabitReminders } from '../notifications';

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

  // Real shapes from expo-notifications on Android: from API 33 the permission reads `denied` with canAskAgain true both
  // before the first prompt and after one refusal, so only our own record can tell them apart.
  describe('whether the person was ever asked', () => {
    const NOT_YET_API33 = { status: 'denied', granted: false, canAskAgain: true };
    const asked = () => AsyncStorage.setItem('eiyu:notification-permission-asked', '1');
    beforeEach(() => AsyncStorage.removeItem('eiyu:notification-permission-asked'));

    it('is true on Android 13 and newer before the first prompt', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue(NOT_YET_API33);
      await expect(notificationPermissionNeverAsked()).resolves.toBe(true);
      expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });

    it('is true where the system reports undetermined', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined', granted: false, canAskAgain: true });
      await expect(notificationPermissionNeverAsked()).resolves.toBe(true);
    });

    it('is false after one refusal, which reads the same to the system', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue(NOT_YET_API33);
      await asked();
      await expect(notificationPermissionNeverAsked()).resolves.toBe(false);
    });

    it('is false once the system will not show the prompt any more', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'denied', granted: false, canAskAgain: false });
      await expect(notificationPermissionNeverAsked()).resolves.toBe(false);
    });

    it('is false when permission is already granted', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true });
      await expect(notificationPermissionNeverAsked()).resolves.toBe(false);
    });

    it('is false when the record cannot be read, so a failure never causes a prompt', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue(NOT_YET_API33);
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));
      await expect(notificationPermissionNeverAsked()).resolves.toBe(false);
    });

    it('is recorded by a prompt, whatever the answer', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue(NOT_YET_API33);
      mockNotifications.requestPermissionsAsync.mockResolvedValue({ granted: false });
      await requestNotificationPermissions();
      await expect(notificationPermissionNeverAsked()).resolves.toBe(false);
    });

    it('is not recorded when nothing was shown because permission was already granted', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true, canAskAgain: true });
      await requestNotificationPermissions();
      expect(await AsyncStorage.getItem('eiyu:notification-permission-asked')).toBeNull();
    });

    it('still shows the prompt when the record cannot be saved', async () => {
      mockNotifications.getPermissionsAsync.mockResolvedValue(NOT_YET_API33);
      mockNotifications.requestPermissionsAsync.mockResolvedValue({ granted: true });
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));
      await expect(requestNotificationPermissions()).resolves.toBe(true);
    });
  });
});
