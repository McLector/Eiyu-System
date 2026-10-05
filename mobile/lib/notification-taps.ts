import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

/** The Board lane a reminder belongs to. Backlog quests have no reminders, so there is no Backlog value. */
export type ReminderLane = 'daily' | 'one-time';

/** Reads the lane a reminder recorded in its notification data; anything else (older reminders, other senders) is null. */
export function laneFromNotificationData(data: unknown): ReminderLane | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const lane = (data as { lane?: unknown }).lane;
  return lane === 'daily' || lane === 'one-time' ? lane : null;
}

/**
 * Tapping a reminder opens the Board on the lane it belongs to, whether the app was closed, in the background or on screen.
 * Pass `enabled` false until the user is signed in: the tap is kept and handled once they are.
 */
export function useNotificationTaps(enabled: boolean) {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !response) return;
    // A weekly reminder keeps one identifier, so the delivery time is part of what makes a tap new.
    const key = `${response.notification.request.identifier}:${response.notification.date}`;
    if (handled.current === key) return;
    handled.current = key;
    const lane = laneFromNotificationData(response.notification.request.content.data);
    router.navigate(lane ? { pathname: '/(tabs)/board', params: { lane } } : { pathname: '/(tabs)/board' });
  }, [enabled, response]);
}
