jest.mock('expo-notifications', () => ({
  __esModule: true,
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { CALENDAR: 'calendar', WEEKLY: 'weekly', DATE: 'date' },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  dismissAllNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('scheduled-id'),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DELIVERED_REMINDER_NOTICE } from '@eiyu/shared';
import * as Notifications from 'expo-notifications';

import {
  cancelProtectedReminders,
  cancelRemindersForHabits,
  filterReminderRows,
  notifyRecoveryQuestGenerated,
  scheduleHabitReminders,
  scheduleOneTimeReminder,
} from '../notifications';

const n = Notifications as unknown as Record<string, jest.Mock>;
const KEY = 'eiyu:notification-ids';
const denied = { canWriteBasic: true, canWriteCustom: false };
const granted = { canWriteBasic: true, canWriteCustom: true };

const basic = (id: string) => ({ id, inputKind: 'basic' as const });
const custom = (id: string) => ({ id, inputKind: 'custom' as const });
const unclassified = (id: string) => ({ id });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('filterReminderRows', () => {
  it('drops custom and unclassified rows once custom permission is observed denied, keeps basic ones', () => {
    const rows = [basic('a'), custom('b'), unclassified('c')];
    expect(filterReminderRows(rows, denied).map(r => r.id)).toEqual(['a']);
  });

  it('keeps every row while custom permission is granted', () => {
    const rows = [basic('a'), custom('b'), unclassified('c')];
    expect(filterReminderRows(rows, granted)).toEqual(rows);
  });

  it('does not treat an unknown capability as a denial', () => {
    const rows = [basic('a'), custom('b')];
    expect(filterReminderRows(rows, null)).toEqual(rows);
    expect(filterReminderRows(rows, undefined)).toEqual(rows);
  });

  it('leaves basic reminders alone on a paused account', () => {
    expect(filterReminderRows([basic('a'), custom('b')], { canWriteBasic: false, canWriteCustom: false }).map(r => r.id)).toEqual(['a']);
  });

  it('does not mutate its input', () => {
    const rows = [basic('a'), custom('b')];
    filterReminderRows(rows, denied);
    expect(rows).toHaveLength(2);
  });
});

describe('cancelRemindersForHabits', () => {
  it('cancels only the named quests scheduled ids and keeps the other entries', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ a: ['os-a1', 'os-a2'], b: ['os-b1'] }));
    await cancelRemindersForHabits(['a']);
    expect(n.cancelScheduledNotificationAsync.mock.calls.map(c => c[0]).sort()).toEqual(['os-a1', 'os-a2']);
    expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ b: ['os-b1'] });
  });

  it('touches nothing for a quest Eiyu never scheduled', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ b: ['os-b1'] }));
    await cancelRemindersForHabits(['zzz']);
    expect(n.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ b: ['os-b1'] });
  });

  it('never cancels everything, lists other reminders, dismisses delivered ones, or changes permission or channel', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ a: ['os-a1'] }));
    await cancelRemindersForHabits(['a']);
    for (const name of ['cancelAllScheduledNotificationsAsync', 'getAllScheduledNotificationsAsync', 'dismissAllNotificationsAsync', 'requestPermissionsAsync', 'getPermissionsAsync', 'setNotificationChannelAsync']) {
      expect(n[name]).not.toHaveBeenCalled();
    }
  });

  it('keeps the id of a failed cancel so a retry can finish it', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ a: ['os-a1'] }));
    n.cancelScheduledNotificationAsync.mockRejectedValueOnce(new Error('os down'));
    await expect(cancelRemindersForHabits(['a'])).rejects.toThrow('os down');
    expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ a: ['os-a1'] });
  });
});

describe('cancelProtectedReminders', () => {
  it('cancels only protected rows after a denial', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ a: ['os-a'], b: ['os-b'], c: ['os-c'] }));
    const count = await cancelProtectedReminders([basic('a'), custom('b'), unclassified('c')], denied);
    expect(count).toBe(2);
    expect(n.cancelScheduledNotificationAsync.mock.calls.map(c => c[0]).sort()).toEqual(['os-b', 'os-c']);
    expect(JSON.parse((await AsyncStorage.getItem(KEY))!)).toEqual({ a: ['os-a'] });
  });

  it('cancels nothing while permission is granted or unknown', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ b: ['os-b'] }));
    expect(await cancelProtectedReminders([custom('b')], granted)).toBe(0);
    expect(await cancelProtectedReminders([custom('b')], null)).toBe(0);
    expect(n.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('titles are never invented from an old cache', () => {
  it('uses a neutral title when a weekly reminder has no name', async () => {
    await scheduleHabitReminders('h', { name: null, time: '07:00', days: [1] }, 'UTC');
    expect(n.scheduleNotificationAsync.mock.calls[0][0].content.title).toBe('Quest reminder');
  });

  it('still uses the name when one is supplied (basic reminders unaffected)', async () => {
    await scheduleHabitReminders('h', { name: 'Run', time: '07:00', days: [1] }, 'UTC');
    expect(n.scheduleNotificationAsync.mock.calls[0][0].content.title).toBe('Run');
  });

  it('uses a neutral title for a one-time reminder with a blank name', async () => {
    await scheduleOneTimeReminder('o', { name: '   ', time: '09:00', date: '2999-01-01' }, 'UTC');
    expect(n.scheduleNotificationAsync.mock.calls[0][0].content.title).toBe('Quest reminder');
  });

  it('does not put a missing name in the recovery notice', async () => {
    await notifyRecoveryQuestGenerated(null);
    const body = n.scheduleNotificationAsync.mock.calls[0][0].content.body as string;
    expect(body).not.toMatch(/null|undefined|""/);
    await notifyRecoveryQuestGenerated('Run');
    expect(n.scheduleNotificationAsync.mock.calls[1][0].content.body).toContain('"Run"');
  });
});

describe('delivered copies', () => {
  it('says already-delivered reminders stay and does not claim they were recalled', () => {
    expect(DELIVERED_REMINDER_NOTICE).toMatch(/already delivered/i);
    expect(DELIVERED_REMINDER_NOTICE).not.toMatch(/recall|erased|wiped|removed from/i);
  });
});
