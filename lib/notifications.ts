import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// expo-notifications only supports Android/iOS — every export here is a
// no-op on web rather than throwing, so the app still runs there.
const SUPPORTED = Platform.OS !== 'web';

const CHANNEL_ID = 'eiyu-quest-reminders';
const NOTIFICATION_IDS_KEY = 'eiyu:notification-ids';

export interface ReminderSchedule {
  name: string;
  time: string;
  days: number[];
}

if (SUPPORTED) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureNotificationSetup() {
  if (!SUPPORTED) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Quest Reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!SUPPORTED) return false;
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function readIdMap(): Promise<Record<string, string[]>> {
  const raw = await AsyncStorage.getItem(NOTIFICATION_IDS_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function writeIdMap(map: Record<string, string[]>) {
  await AsyncStorage.setItem(NOTIFICATION_IDS_KEY, JSON.stringify(map));
}

/** R-03/R-40: cancel any previously-scheduled reminders for a habit (edit/archive). */
export async function cancelHabitReminders(habitId: string) {
  if (!SUPPORTED) return;
  const map = await readIdMap();
  const ids = map[habitId] ?? [];
  await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id)));
  delete map[habitId];
  await writeIdMap(map);
}

/**
 * R-40: one weekly-repeating trigger per scheduled day at the habit's
 * reminder time. JS day-of-week (0=Sun) -> expo-notifications weekday
 * (1=Sun), hence the +1.
 */
export async function scheduleHabitReminders(habitId: string, input: ReminderSchedule) {
  if (!SUPPORTED) return;
  await cancelHabitReminders(habitId);

  const [hour, minute] = input.time.split(':').map(Number);
  const ids = await Promise.all(
    input.days.map(day =>
      Notifications.scheduleNotificationAsync({
        content: {
          title: input.name,
          body: 'Time for your quest — tap to open Eiyu System.',
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: day + 1,
          hour,
          minute,
          channelId: CHANNEL_ID,
        },
      })
    )
  );

  const map = await readIdMap();
  map[habitId] = ids;
  await writeIdMap(map);
}

export async function cancelAllHabitReminders() {
  if (!SUPPORTED) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  await writeIdMap({});
}

/** R-41/R-15: fired immediately when a habit's streak newly freezes — neutral wording, no shame language. */
export async function notifyRecoveryQuestGenerated(habitName: string) {
  if (!SUPPORTED) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Recovery Quest available',
      body: `"${habitName}" has a 24h recovery window — complete the easy version to keep your streak.`,
      sound: true,
    },
    trigger: null, // fire immediately
  });
}
