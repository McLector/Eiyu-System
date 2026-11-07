import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  TRACKER_ACCESS_MESSAGE, fetchTrackerAccess, subscribeTrackerAccessChanges, trackerErrorKind,
  type TrackerAccess, type TrackerErrorKind, type TrackerInputKind, type TrackerTargetSnapshot,
} from '@eiyu/shared';

export const trackerKey = (userId?: string) => ['tracker', userId ?? null] as const;

/** One owner-bound read of the tracker capability, shared by the store, Gym and the editors under one query key. */
export function useTrackerAccess(userId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return undefined;
    let off: (() => void) | undefined;
    try {
      off = subscribeTrackerAccessChanges(() => { void qc.invalidateQueries({ queryKey: trackerKey(userId) }); });
    } catch { /* A missing subscription only means no push refresh; the next read still asks the server. */ }
    return () => off?.();
  }, [qc, userId]);
  return useQuery({
    queryKey: trackerKey(userId),
    queryFn: () => readTrackerAccess(userId!),
    enabled: !!userId,
    // A capability decides what may be written, so it is re-read whenever a screen asks for it.
    staleTime: 0,
  });
}

/** The wrapper turns a synchronous failure into a handled rejection; a foreign owner's capability is never accepted. */
export async function readTrackerAccess(userId: string): Promise<TrackerAccess> {
  const access = await Promise.resolve().then(() => fetchTrackerAccess(userId));
  if (access.revision.userId !== userId) throw new Error(TRACKER_ACCESS_MESSAGE);
  return access;
}

export function safeTrackerErrorKind(error: unknown): TrackerErrorKind | null {
  try { return trackerErrorKind(error); } catch { return null; }
}

/** The kinds that mean the permission or the record changed under the person: refresh, never retry. */
export function isAccessChange(kind: TrackerErrorKind | null): boolean {
  return kind === 'access-changed' || kind === 'purpose-required' || kind === 'under12-paused' || kind === 'denied';
}

export const TRACKER_MESSAGES = {
  paused: 'Tracker changes are paused for this account.',
  changed: 'Your permissions or this record changed, so nothing was saved. Access was refreshed; review it and try again.',
  purpose: 'The System could not make that change right now. Reload and try again.',
} as const;

/** Wording for a refused tracker write; null when the error is not a tracker error. */
export function trackerErrorMessage(error: unknown): string | null {
  switch (safeTrackerErrorKind(error)) {
    case 'under12-paused': return TRACKER_MESSAGES.paused;
    case 'purpose-required': return TRACKER_MESSAGES.purpose;
    case 'access-changed': return TRACKER_MESSAGES.changed;
    default: return null;
  }
}

/** After a refused or stale write: re-read the capability for that owner. The write itself is never replayed. */
export function refreshTrackerAfterFailure(qc: QueryClient, userId: string | undefined, error: unknown): void {
  if (userId && isAccessChange(safeTrackerErrorKind(error))) void qc.invalidateQueries({ queryKey: trackerKey(userId) });
}

export interface TrackedRecord { inputKind?: TrackerInputKind; canWrite?: boolean }

/**
 * The only denial the app decides itself: with no revision loaded there is nothing to send. Everything else (a paused account, a
 * record the person may not change) is the gateway's call, and its refusal is worded by trackerErrorMessage.
 */
export function writeDenial(access: Pick<TrackerAccess, 'revision'> | null | undefined): string | null {
  return access ? null : TRACKER_ACCESS_MESSAGE;
}

export function snapshotOf(kind: 'habit' | 'chain', record: { id: string; inputKind?: TrackerInputKind }): TrackerTargetSnapshot {
  return { kind, id: record.id, inputKind: record.inputKind ?? 'custom' };
}
