import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TrackerRevision } from '@eiyu/shared';

import { cleanRevision } from '@/lib/write-queue';
import type { QueueWriteAccess } from '@/lib/write-queue-engine';

/**
 * The last live read of what this account could write, so a tap can still be queued when the app starts offline.
 * It is not proof of permission. It is used only to queue a tap; the queue checks access again before sending and the
 * server decides. It never enters the query cache and never allows a write that goes straight to the server.
 */
export interface TrackerWriteMarker {
  userId: string;
  revision: TrackerRevision;
  canWriteBasic: boolean;
  canWriteCustom: boolean;
  savedAt: number;
}

/** The same life as the stored board (`maxAge` in app/_layout): with the board gone there is nothing left to tap. */
export const TRACKER_WRITE_MARKER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const trackerWriteMarkerKey = (userId: string) => `eiyu.trackerWriteMarker.v1.${userId}`;

export function encodeTrackerWriteMarker(access: QueueWriteAccess, savedAt: number): string {
  const marker: TrackerWriteMarker = {
    userId: access.revision.userId, revision: access.revision,
    canWriteBasic: access.canWriteBasic, canWriteCustom: access.canWriteCustom, savedAt,
  };
  return JSON.stringify(marker);
}

export function decodeTrackerWriteMarker(raw: string | null | undefined, userId: string): TrackerWriteMarker | null {
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const m = value as Record<string, unknown>;
  const revision = cleanRevision(m.revision, userId);
  if (m.userId !== userId || !revision || typeof m.canWriteBasic !== 'boolean' || typeof m.canWriteCustom !== 'boolean') return null;
  if (typeof m.savedAt !== 'number' || !Number.isFinite(m.savedAt)) return null;
  return { userId, revision, canWriteBasic: m.canWriteBasic, canWriteCustom: m.canWriteCustom, savedAt: m.savedAt };
}

/** What a marker allows now. A date ahead of the clock counts as unusable, because its age cannot be known. */
export function markerAccess(marker: TrackerWriteMarker | null, userId: string | undefined, nowMs: number): QueueWriteAccess | null {
  if (!marker || !userId || marker.userId !== userId || !marker.canWriteBasic) return null;
  const age = nowMs - marker.savedAt;
  if (age < 0 || age >= TRACKER_WRITE_MARKER_MAX_AGE_MS) return null;
  return { revision: marker.revision, canWriteBasic: true, canWriteCustom: marker.canWriteCustom };
}

export async function readTrackerWriteMarker(userId: string): Promise<TrackerWriteMarker | null> {
  try { return decodeTrackerWriteMarker(await AsyncStorage.getItem(trackerWriteMarkerKey(userId)), userId); } catch { return null; }
}

export async function saveTrackerWriteMarker(access: QueueWriteAccess, savedAt: number): Promise<void> {
  try { await AsyncStorage.setItem(trackerWriteMarkerKey(access.revision.userId), encodeTrackerWriteMarker(access, savedAt)); } catch { /* Only a later offline tap is affected. */ }
}

export async function clearTrackerWriteMarker(userId: string): Promise<void> {
  try { await AsyncStorage.removeItem(trackerWriteMarkerKey(userId)); } catch { /* Bound to this account's id, so no other account can use it. */ }
}
