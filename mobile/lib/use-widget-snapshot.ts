import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import type { Palette, ThemeMode } from '@eiyu/shared/src/theme/palettes';
import type { Quest } from '@eiyu/shared/src/types/eiyu';

import { drawTodayWidget } from '@/widgets/widget-task-handler';

import {
  buildSignedOutSnapshot,
  buildWidgetSnapshot,
  dataDateOf,
  encodeSnapshot,
  WIDGET_KEY,
  type WidgetSnapshot,
} from './widget-snapshot';
import type { QueueEntry } from './write-queue';

const WIDGET_NAME = 'EiyuToday';

export interface WidgetSnapshotInput {
  /** Auth has not answered yet: whether anyone is signed in is not known. */
  authLoading: boolean;
  userId: string | undefined;
  /** The profile's own time zone, never the device zone: null until the profile has loaded. */
  accountTimeZone: string | null;
  /** The cached board for this user, undefined until it exists. */
  cachedQuests: Quest[] | undefined;
  /** When that board was fetched (ms), 0 when it never was. The day it belongs to follows from this, not from the clock. */
  dataUpdatedAt: number;
  entries: readonly QueueEntry[];
  palette: Palette;
  mode: ThemeMode;
}

/** What to store now, or null when the app does not yet know enough to say anything (the last good snapshot stays). */
function snapshotFor(input: WidgetSnapshotInput): WidgetSnapshot | null {
  if (input.authLoading) return null;
  if (!input.userId) return buildSignedOutSnapshot({ palette: input.palette, mode: input.mode, now: 0 });
  if (!input.accountTimeZone || !input.cachedQuests || !(input.dataUpdatedAt > 0)) return null;
  let dataDate: string;
  try {
    dataDate = dataDateOf(input.dataUpdatedAt, input.accountTimeZone);
  } catch {
    return null;
  }
  return buildWidgetSnapshot({
    cachedQuests: input.cachedQuests,
    entries: input.entries,
    dataDate,
    timeZone: input.accountTimeZone,
    palette: input.palette,
    mode: input.mode,
    now: input.dataUpdatedAt,
  });
}

async function redrawWidget(): Promise<void> {
  try {
    await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: size => drawTodayWidget(size) });
  } catch {
    // No native module (an old build) or no widget placed: the stored snapshot still serves the next scheduled draw.
  }
}

/**
 * Keeps the home-screen widget's snapshot current. The widget runs headless and reads only what this wrote (D19), so
 * this is the one place that decides what it says: nothing is written until auth, the account zone and the board are all
 * known, so a cold start can never replace a good snapshot with an empty one.
 */
export function useWidgetSnapshot(input: WidgetSnapshotInput): void {
  const { authLoading, userId, accountTimeZone, cachedQuests, dataUpdatedAt, entries, palette, mode } = input;
  const snapshot = useMemo(
    () => snapshotFor({ authLoading, userId, accountTimeZone, cachedQuests, dataUpdatedAt, entries, palette, mode }),
    [authLoading, userId, accountTimeZone, cachedQuests, dataUpdatedAt, entries, palette, mode],
  );
  const lastWritten = useRef<string | null>(null);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const previousUser = useRef(userId);

  const enqueueWrite = (task: () => Promise<void>) => {
    writes.current = writes.current.then(task, task);
  };

  // A different user is now signed in: the old user's quests must not stay on the home screen while the new board loads.
  useEffect(() => {
    const previous = previousUser.current;
    previousUser.current = userId;
    if (Platform.OS !== 'android' || !previous || !userId || previous === userId) return;
    lastWritten.current = null;
    enqueueWrite(async () => {
      try {
        await AsyncStorage.removeItem(WIDGET_KEY);
      } catch {
        return;
      }
      await redrawWidget();
    });
  }, [userId]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !snapshot) return;
    // The change key leaves the signed-out stamp out: that one is the moment of writing, not content.
    const key = encodeSnapshot(snapshot);
    if (key === lastWritten.current) return;
    lastWritten.current = key;
    enqueueWrite(async () => {
      const stamped = snapshot.state === 'signed-out' ? { ...snapshot, writtenAt: Date.now() } : snapshot;
      try {
        await AsyncStorage.setItem(WIDGET_KEY, encodeSnapshot(stamped));
      } catch {
        lastWritten.current = null; // let the next change try again
        return;
      }
      await redrawWidget();
    });
  }, [snapshot]);
}
