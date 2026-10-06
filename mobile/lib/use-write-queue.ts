import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Quest } from '@eiyu/shared';

import { newRequestId } from '@/lib/request-id';
import { createWriteQueueEngine, type EnqueueRequest, type WriteQueueEngine } from '@/lib/write-queue-engine';
import type { QueueEntry } from '@/lib/write-queue';

export interface UseWriteQueueOptions {
  userId: string | undefined;
  /** The account's IANA zone, read fresh each time (it can change while entries wait). Null until the profile has loaded. */
  timeZone: () => string | null;
  send: (entry: QueueEntry) => Promise<unknown>;
  readQuest: (habitId: string) => Promise<Quest | undefined>;
  onApplied: (entry: QueueEntry, result?: unknown) => Promise<void> | void;
  onFailed?: (entry: QueueEntry) => void;
}

export interface WriteQueue {
  entries: QueueEntry[];
  /** True only when the device is known to be offline; unknown counts as online. */
  offline: boolean;
  enqueue: (request: EnqueueRequest) => void;
  flush: () => Promise<void>;
  /** Fails entries from an earlier account day (the midnight tick). */
  sweep: () => void;
  /** Puts a failed entry back in line and sends it. False when it cannot be retried (its day passed). */
  retry: (id: string) => boolean;
  dismiss: (id: string) => QueueEntry | undefined;
}

/**
 * Owns one write-queue engine per signed-in user and feeds it the triggers that mean "try the queue now": launch, the
 * connection coming back, and the app returning to the foreground. The midnight tick comes from the caller.
 */
export function useWriteQueue(options: UseWriteQueueOptions): WriteQueue {
  const { userId } = options;
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const [engine, setEngine] = useState<WriteQueueEngine | null>(null);
  const [offline, setOffline] = useState(false);
  const [snapshot, setSnapshot] = useState<{ userId: string | undefined; entries: QueueEntry[] }>({ userId: undefined, entries: [] });

  useEffect(() => {
    if (!userId) {
      setEngine(null);
      return;
    }
    let online: boolean | null = null;
    let heardFromListener = false;
    setOffline(false);
    const created = createWriteQueueEngine({
      userId,
      storage: AsyncStorage,
      now: () => new Date(),
      timeZone: () => latest.current.timeZone(),
      isOnline: () => online,
      newId: newRequestId,
      send: entry => latest.current.send(entry),
      readQuest: habitId => latest.current.readQuest(habitId),
      onApplied: (entry, result) => latest.current.onApplied(entry, result),
      onFailed: entry => latest.current.onFailed?.(entry),
    });
    setEngine(created);
    const unsubscribe = created.subscribe(entries => setSnapshot({ userId, entries }));

    const networkSubscription = Network.addNetworkStateListener(state => {
      heardFromListener = true;
      online = state.isConnected ?? null;
      setOffline(online === false);
      if (state.isConnected === true) void created.flush();
    });
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') void created.flush();
    });

    void Network.getNetworkStateAsync()
      .then(state => {
        if (heardFromListener) return;
        online = state.isConnected ?? null;
        setOffline(online === false);
      })
      .catch(() => {})
      .then(() => created.load())
      .then(() => created.flush());

    return () => {
      created.dispose();
      unsubscribe();
      networkSubscription?.remove?.();
      appStateSubscription?.remove?.();
    };
  }, [userId]);

  const enqueue = useCallback((request: EnqueueRequest) => engine?.enqueue(request), [engine]);
  const flush = useCallback(() => engine?.flush() ?? Promise.resolve(), [engine]);
  const sweep = useCallback(() => engine?.sweep(), [engine]);
  const retry = useCallback(
    (id: string) => {
      const retried = engine?.retry(id) ?? false;
      if (retried) void engine?.flush();
      return retried;
    },
    [engine]
  );
  const dismiss = useCallback((id: string) => engine?.dismiss(id), [engine]);

  const entries = snapshot.userId === userId ? snapshot.entries : EMPTY;
  return useMemo(() => ({ entries, offline, enqueue, flush, sweep, retry, dismiss }), [entries, offline, enqueue, flush, sweep, retry, dismiss]);
}

const EMPTY: QueueEntry[] = [];
