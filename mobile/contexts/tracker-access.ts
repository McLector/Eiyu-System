import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  TRACKER_ACCESS_MESSAGE, fetchAccountAge, fetchTrackerAccess, subscribeAccountAgeChanges, subscribeTrackerAccessChanges, trackerErrorKind,
  type AccountAge, type TrackerAccess, type TrackerErrorKind, type TrackerInputKind, type TrackerTargetSnapshot,
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

export type AccountAudience = 'teen' | 'adult';
export const accountAgeKey = (userId?: string) => ['account-age', userId ?? null] as const;

/** Declared age band from the age read: a birthday with no adult declaration is teen, any other birthday is adult, none is unknown. */
export function audienceOf(age: Pick<AccountAge, 'birthDate' | 'adultDeclared'>): AccountAudience | null {
  return age.birthDate ? (age.adultDeclared === false ? 'teen' : 'adult') : null;
}

/**
 * The declared age band for the optional-notice prompts, from one shared read under one query key. Only the band is kept (never the
 * birthday). Unknown, still loading, failed or another account's read all give undefined, which shows the adult notice. It reads
 * only when `enabled`, so nobody pays for it unless a prompt can appear.
 */
export function useAccountAudience(userId: string | undefined, enabled = true): AccountAudience | undefined {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return undefined;
    let off: (() => void) | undefined;
    try {
      off = subscribeAccountAgeChanges(() => { void qc.invalidateQueries({ queryKey: accountAgeKey(userId) }); });
    } catch { /* No subscription only means a birthday change shows after the next read. */ }
    return () => off?.();
  }, [qc, userId]);
  const query = useQuery({
    queryKey: accountAgeKey(userId),
    queryFn: async () => {
      const age = await Promise.resolve().then(() => fetchAccountAge());
      return age.userId === userId ? audienceOf(age) : null;
    },
    enabled: !!userId && enabled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return query.data ?? undefined;
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
  readOnly: 'This quest has custom details, so it is read-only until custom tracker permission is granted. Review it in Edit details.',
  fitness: 'Gym changes need Gym tracking permission. Your history stays readable.',
  changed: 'Your permissions or this record changed, so nothing was saved. Access was refreshed; review it and try again.',
  purpose: 'That needs permission first. Review it in Edit details.',
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

/** A known denial, decided before anything is sent. An unclassified record counts as custom and read-only. */
export function writeDenial(access: Pick<TrackerAccess, 'canWriteBasic' | 'canWriteCustom'> | null | undefined, records: readonly TrackedRecord[]): string | null {
  if (!access) return TRACKER_ACCESS_MESSAGE;
  if (!access.canWriteBasic) return TRACKER_MESSAGES.paused;
  for (const record of records) {
    if (record.canWrite !== true || !record.inputKind) return TRACKER_MESSAGES.readOnly;
    if (record.inputKind === 'custom' && !access.canWriteCustom) return TRACKER_MESSAGES.readOnly;
  }
  return null;
}

export function snapshotOf(kind: 'habit' | 'chain', record: { id: string; inputKind?: TrackerInputKind }): TrackerTargetSnapshot {
  return { kind, id: record.id, inputKind: record.inputKind ?? 'custom' };
}
