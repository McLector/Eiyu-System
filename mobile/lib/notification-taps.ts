import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

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
  const [response, setResponse] = useState<Notifications.NotificationResponse | null>(null);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let observedLive = false;
    let subscription: ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | undefined;
    const receive = (next: Notifications.NotificationResponse | null) => {
      if (!active || !next || next.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      setResponse(next);
    };
    try {
      // The SDK's last-response hook filters by identifier only, hiding later
      // deliveries of the same recurring reminder. Listen to the public stream.
      subscription = Notifications.addNotificationResponseReceivedListener(next => {
        observedLive = true;
        receive(next);
      });
      try {
        const cached = Notifications.getLastNotificationResponse();
        if (!observedLive) receive(cached);
      } catch {
        // A failed cache read must not disable the already-installed listener.
      }
    } catch {
      // An unavailable native receiver cannot authorize navigation.
    }
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (!enabled || !response) return;
    // A weekly reminder keeps one identifier, so the delivery time is part of what makes a tap new.
    const key = JSON.stringify([
      response.notification.request.identifier,
      response.notification.date,
      response.actionIdentifier,
    ]);
    if (handled.current === key) return;
    handled.current = key;
    const lane = laneFromNotificationData(response.notification.request.content.data);
    router.navigate(lane ? { pathname: '/(tabs)/board', params: { lane } } : { pathname: '/(tabs)/board' });
  }, [enabled, response]);
}
