import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  accountDateKey,
  deviceTimeZone,
  nextAccountWeekdayInstant,
  weekdayForDateKey,
  zonedDateTimeInstant,
} from '@eiyu/shared';
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

/**
 * The id map is a plain non-atomic read-modify-write on AsyncStorage.
 * Concurrent scheduling (e.g. syncAllReminders re-arming several one-time
 * reminders via Promise.all) would let two calls read before either writes,
 * and the second write clobbers the first quest's entry - leaving an
 * orphaned OS notification that later cleanup can't find. Serializing every
 * map operation through this queue makes each read-modify-write atomic
 * relative to the others.
 */
let mapOpQueue: Promise<unknown> = Promise.resolve();
function serializeMapOp<T>(op: () => Promise<T>): Promise<T> {
  const run = mapOpQueue.then(op, op);
  mapOpQueue = run.catch(() => {});
  return run;
}

/**
 * Unlocked cancel used by the schedule* functions while they ALREADY hold the
 * map lock - calling the public cancelHabitReminders here would re-enter the
 * non-reentrant mutex and deadlock the shared queue permanently.
 */
async function cancelHabitRemindersLocked(
  map: Record<string, string[]>,
  habitId: string
): Promise<void> {
  const ids = map[habitId] ?? [];
  await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id)));
  delete map[habitId];
}

/** R-03/R-40: cancel any previously-scheduled reminders for a habit (edit/archive). */
export async function cancelHabitReminders(habitId: string) {
  if (!SUPPORTED) return;
  await serializeMapOp(async () => {
    const map = await readIdMap();
    await cancelHabitRemindersLocked(map, habitId);
    await writeIdMap(map);
  });
}

/**
 * R-40: one weekly-repeating trigger per scheduled account weekday at the
 * habit's reminder time. iOS retains the IANA timezone; Android is mapped to
 * the device-local weekly trigger supported by Expo SDK 54.
 */
export async function scheduleHabitReminders(
  habitId: string,
  input: ReminderSchedule,
  timeZone: string
) {
  if (!SUPPORTED) return;
  await serializeMapOp(async () => {
    const map = await readIdMap();
    // Unlocked variant — we already hold the map lock (see deadlock note above).
    await cancelHabitRemindersLocked(map, habitId);

    const [hour, minute] = input.time.split(':').map(Number);
    const localZone = deviceTimeZone();
    const ids = await Promise.all(
      input.days.map(day => {
        // iOS accepts an IANA timezone directly. Android's SDK 54 weekly
        // trigger is device-local, so map the next account-zone occurrence
        // to device-local weekday/time and re-arm during normal app sync.
        const trigger: Notifications.NotificationTriggerInput = Platform.OS === 'ios'
          ? {
              type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
              weekday: day + 1,
              hour,
              minute,
              second: 0,
              repeats: true,
              timezone: timeZone,
            }
          : (() => {
              const next = nextAccountWeekdayInstant(new Date(), day, input.time, timeZone);
              const localKey = accountDateKey(next, localZone);
              const localClock = new Intl.DateTimeFormat('en-US', {
                timeZone: localZone,
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23',
              }).formatToParts(next);
              const part = (type: Intl.DateTimeFormatPartTypes) =>
                Number(localClock.find(value => value.type === type)?.value);
              return {
                type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
                weekday: weekdayForDateKey(localKey) + 1,
                hour: part('hour'),
                minute: part('minute'),
                channelId: CHANNEL_ID,
              };
            })();
        return Notifications.scheduleNotificationAsync({
          content: {
            title: input.name,
            body: 'Time for your quest — tap to open Eiyu System.',
            sound: true,
          },
          trigger,
        });
      })
    );

    map[habitId] = ids;
    await writeIdMap(map);
  });
}

/**
 * One-time quests (#7): a single DATE trigger at the quest's scheduled date
 * and HH:mm in the persisted account timezone. If that moment has already
 * passed, nothing is scheduled —
 * a past-due one-time quest silently reminding about a missed todo would
 * violate the app's no-shame principle (R-15). IDs land in the same map,
 * so cancelHabitReminders/edit/archive clean these up exactly like weekly
 * ones. `date` is "YYYY-MM-DD" (Slice 4) — previously this always
 * scheduled for today; a future-scheduled quest's reminder now correctly
 * fires on its own day, not the day it was created.
 */
export async function scheduleOneTimeReminder(
  habitId: string,
  input: { name: string; time: string; date: string },
  timeZone: string
) {
  if (!SUPPORTED) return;
  await serializeMapOp(async () => {
    const map = await readIdMap();
    // Unlocked variant — we already hold the map lock (see deadlock note above).
    await cancelHabitRemindersLocked(map, habitId);

    const at = zonedDateTimeInstant(input.date, input.time, timeZone);
    if (at.getTime() <= Date.now()) {
      await writeIdMap(map); // persist the cancel even when nothing is scheduled
      return;
    }

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: input.name,
        body: 'One-time quest reminder — tap to open Eiyu System.',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
        channelId: CHANNEL_ID,
      },
    });

    map[habitId] = [id];
    await writeIdMap(map);
  });
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
      body: `"${habitName}" has a one-day recovery window — complete the penalty to keep your streak.`,
      sound: true,
    },
    trigger: null, // fire immediately
  });
}
