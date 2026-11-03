import {supabase} from '../supabase/client';
import {authorizationForOwner} from '../supabase/authorization';
import {initializeAccountTimeZone} from './profile';
import {
  copyTrackerRevision, TRACKER_ACCESS_MESSAGE,
  type TrackerOperation, type TrackerRevision, type TrackerTargetSnapshot,
} from './tracker-access';

export type TrackerErrorKind = 'under12-paused' | 'purpose-required' | 'access-changed' | 'invalid-input' | 'denied';
/** ET001 under12, ET002 purpose/authority missing, ET003 stale revision or target, 22023 invalid input, 42501 denied. */
export const TRACKER_ERROR_CODES: Readonly<Record<string, TrackerErrorKind>> = {
  ET001: 'under12-paused',
  ET002: 'purpose-required',
  ET003: 'access-changed',
  '22023': 'invalid-input',
  '42501': 'denied',
};
/** Pass for creation and fitness operations. */
export const NO_TARGETS: readonly TrackerTargetSnapshot[] = [];

export interface PrepareDayResult {
  basicPrepared: boolean;
  protectedPrepared: boolean;
  accessChanged: boolean;
}

const OPERATIONS: ReadonlySet<string> = new Set<TrackerOperation>([
  'habit-save', 'complete_habit', 'undo_habit_completion', 'increment_habit_progress', 'complete_habit_recovery',
  'archive_habit', 'restore_habit', 'delete_habit', 'move_backlog_to_one_time', 'move_one_time_to_backlog', 'reorder_quests',
  'chain-save', 'set_long_quest_stage_done_receipt', 'reorder_long_quests', 'chain-delete',
  'gym-routine-save', 'gym-routine-archive', 'save_gym_exercise', 'remove_gym_exercise', 'delete_gym_routine',
  'reorder_gym_exercises', 'start_gym_session', 'save_gym_session', 'discard_gym_session', 'log_gym_weight', 'prepare-day',
]);
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Thrown before any request leaves the device: the write was never sent, so there is nothing to reconcile. */
export class TrackerWriteRefused extends Error {
  constructor() { super(TRACKER_ACCESS_MESSAGE); this.name = 'TrackerWriteRefused'; }
}
/** No server code means no answer arrived, so the write may have landed. A write that was never sent is not one of these. */
export function isUnansweredTrackerWrite(error: unknown): boolean {
  if (error instanceof TrackerWriteRefused) return false;
  return !(error && typeof error === 'object' && (error as {code?: unknown}).code);
}
/** The gateway's answer when the record is not there, which is also what a repeat of a delete that landed gets. */
export function isTrackerTargetGone(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const {code, message} = error as {code?: unknown; message?: unknown};
  return code === '42501' && typeof message === 'string' && /tracker target unavailable/i.test(message);
}
/** True when the failure happened locally before the request was sent. Callers must not treat it as an uncertain save. */
export function isRefusedBeforeSend(error: unknown): boolean {
  return error instanceof TrackerWriteRefused;
}

export function trackerErrorKind(error: unknown): TrackerErrorKind | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as {code?: unknown}).code;
  if (typeof code !== 'string' || !Object.prototype.hasOwnProperty.call(TRACKER_ERROR_CODES, code)) return null;
  return TRACKER_ERROR_CODES[code];
}

function snapshotTargets(targets: readonly TrackerTargetSnapshot[]): TrackerTargetSnapshot[] {
  if (!Array.isArray(targets)) throw new TrackerWriteRefused();
  return targets.map(item => {
    const t = item as Partial<TrackerTargetSnapshot> | null;
    if (!t || typeof t !== 'object' || (t.kind !== 'habit' && t.kind !== 'chain') || typeof t.id !== 'string' || !UUID.test(t.id)
      || (t.inputKind !== 'basic' && t.inputKind !== 'custom')) throw new TrackerWriteRefused();
    return {kind: t.kind, id: t.id, inputKind: t.inputKind};
  });
}

/**
 * The only door to a tracker write. Revision and target snapshots are captured here, before the first await, and are
 * never refreshed. Errors surface unchanged (classify with trackerErrorKind); there is no direct-write fallback.
 */
export async function invokeTrackerWrite<T>(
  operation: TrackerOperation,
  args: Record<string, unknown>,
  expected: TrackerRevision,
  targets: readonly TrackerTargetSnapshot[]
): Promise<T> {
  let revision: TrackerRevision;
  try { revision = copyTrackerRevision(expected); } catch { throw new TrackerWriteRefused(); }
  const snapshots = snapshotTargets(targets);
  if (!OPERATIONS.has(operation) || !args || typeof args !== 'object' || Array.isArray(args)
    || Object.prototype.hasOwnProperty.call(args, 'p_expected_targets')) {
    throw new TrackerWriteRefused();
  }
  let authorization: string;
  try { authorization = await authorizationForOwner(revision.userId, TRACKER_ACCESS_MESSAGE); } catch { throw new TrackerWriteRefused(); }
  const {data, error} = await supabase.rpc('apply_tracker_write', {
    p_operation: operation,
    // Callers never supply the snapshots inside args; the transport adds the ones captured above.
    p_arguments: {...args, p_expected_targets: snapshots} as never,
    p_expected: {...revision},
  }).setHeader('Authorization', authorization);
  if (error) throw error;
  return data as T;
}

/**
 * Explicit preparation of the account day. After `accessChanged: true` the caller refreshes its tracker access and must
 * not assume protected work was prepared.
 */
export async function prepareDay(expected: TrackerRevision): Promise<PrepareDayResult> {
  const revision = copyTrackerRevision(expected);
  await initializeAccountTimeZone();
  const data = await invokeTrackerWrite<unknown>('prepare-day', {}, revision, NO_TARGETS);
  const value = data as Partial<Record<keyof PrepareDayResult, unknown>> | null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.basicPrepared !== 'boolean' || typeof value.protectedPrepared !== 'boolean' || typeof value.accessChanged !== 'boolean') {
    throw new Error('Day preparation is unavailable.');
  }
  return {basicPrepared: value.basicPrepared, protectedPrepared: value.protectedPrepared, accessChanged: value.accessChanged};
}
