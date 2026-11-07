import {supabase} from '../supabase/client';
import {authorizationForOwner} from '../supabase/authorization';

export type TrackerPurpose = 'custom-tracker' | 'fitness-tracking';
export type TrackerInputKind = 'basic' | 'custom';
export type TrackerAuthorityState = 'not-required' | 'pending' | 'approved' | 'revoked';
export interface TrackerRevision {
  userId: string;
  ageVersion: number;
  consentVersion: number;
  authorityVersion: number;
}
export interface TrackerAccess {
  contractVersion: 1;
  revision: TrackerRevision;
  canWriteBasic: boolean;
  customConsent: boolean;
  fitnessConsent: boolean;
  customAuthorityState: TrackerAuthorityState;
  fitnessAuthorityState: TrackerAuthorityState;
  canWriteCustom: boolean;
  canWriteFitness: boolean;
}
export interface TrackerTarget {
  kind: 'habit' | 'chain';
  id: string;
  inputKind: TrackerInputKind;
  canWrite: boolean;
}
export type TrackerTargetSnapshot = Pick<TrackerTarget, 'kind' | 'id' | 'inputKind'>;
export type TrackerOperation =
  | 'habit-save' | 'complete_habit' | 'undo_habit_completion'
  | 'increment_habit_progress' | 'complete_habit_recovery'
  | 'archive_habit' | 'restore_habit' | 'delete_habit'
  | 'move_backlog_to_one_time' | 'move_one_time_to_backlog' | 'reorder_quests'
  | 'chain-save' | 'set_long_quest_stage_done_receipt' | 'reorder_long_quests' | 'chain-delete'
  | 'gym-routine-save' | 'gym-routine-archive' | 'save_gym_exercise'
  | 'remove_gym_exercise' | 'delete_gym_routine' | 'reorder_gym_exercises'
  | 'start_gym_session' | 'save_gym_session' | 'discard_gym_session' | 'log_gym_weight'
  | 'prepare-day';

export const CUSTOM_TRACKER_NOTICE_VERSION = '2026-10-23-custom-tracker-v1';
export const FITNESS_TRACKER_NOTICE_VERSION = '2026-10-23-fitness-tracking-v1';
export const TRACKER_NOTICE_VERSIONS: Record<TrackerPurpose, string> = {
  'custom-tracker': CUSTOM_TRACKER_NOTICE_VERSION,
  'fitness-tracking': FITNESS_TRACKER_NOTICE_VERSION,
};
export const TRACKER_ACCESS_MESSAGE = 'Tracker access unavailable.';

const MAX_REVISION = 2147483647;
const AUTHORITY_STATES: readonly string[] = ['not-required', 'pending', 'approved', 'revoked'];
const TARGET_CHUNK = 100;
const CONSENT_NOTICE_MESSAGE = 'Review the current notice before changing this permission.';
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const listeners = new Set<() => void>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function parseRevision(value: unknown): TrackerRevision {
  if (!isRecord(value) || typeof value.userId !== 'string' || !value.userId.trim()) throw new Error(TRACKER_ACCESS_MESSAGE);
  for (const key of ['ageVersion', 'consentVersion', 'authorityVersion'] as const) {
    const n = value[key];
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0 || n > MAX_REVISION) throw new Error(TRACKER_ACCESS_MESSAGE);
  }
  // A fresh literal with exactly the four fields: the server counts keys, and callers' objects can mutate.
  return {
    userId: value.userId, ageVersion: value.ageVersion as number,
    consentVersion: value.consentVersion as number, authorityVersion: value.authorityVersion as number,
  };
}

/** Strict, owner-bound parse. Anything unknown, old, foreign or self-contradicting throws and never becomes a grant. */
export function parseTrackerAccess(value: unknown, expectedOwner: string): TrackerAccess {
  if (typeof expectedOwner !== 'string' || !expectedOwner.trim() || !isRecord(value) || value.contractVersion !== 1) {
    throw new Error(TRACKER_ACCESS_MESSAGE);
  }
  const revision = parseRevision(value.revision);
  if (revision.userId !== expectedOwner) throw new Error(TRACKER_ACCESS_MESSAGE);
  const flags = ['canWriteBasic', 'customConsent', 'fitnessConsent', 'canWriteCustom', 'canWriteFitness'] as const;
  if (flags.some(key => typeof value[key] !== 'boolean')) throw new Error(TRACKER_ACCESS_MESSAGE);
  const customState = value.customAuthorityState;
  const fitnessState = value.fitnessAuthorityState;
  if (typeof customState !== 'string' || !AUTHORITY_STATES.includes(customState)
    || typeof fitnessState !== 'string' || !AUTHORITY_STATES.includes(fitnessState)) throw new Error(TRACKER_ACCESS_MESSAGE);
  // Open tracker (065): the server reports custom and Gym writes equal to basic writes, whatever consent or authority
  // is recorded. The only contradiction left is a write grant while basic writes are paused.
  if ((value.canWriteCustom || value.canWriteFitness) && !value.canWriteBasic) throw new Error(TRACKER_ACCESS_MESSAGE);
  // Project only the contract; unknown fields are not retained.
  return {
    contractVersion: 1, revision, canWriteBasic: value.canWriteBasic as boolean,
    customConsent: value.customConsent as boolean, fitnessConsent: value.fitnessConsent as boolean,
    customAuthorityState: customState as TrackerAuthorityState, fitnessAuthorityState: fitnessState as TrackerAuthorityState,
    canWriteCustom: value.canWriteCustom as boolean, canWriteFitness: value.canWriteFitness as boolean,
  };
}

export async function fetchTrackerAccess(expectedOwner: string): Promise<TrackerAccess> {
  const authorization = await authorizationForOwner(expectedOwner, TRACKER_ACCESS_MESSAGE);
  const {data, error} = await supabase.rpc('get_tracker_processing_access').setHeader('Authorization', authorization);
  if (error) throw error;
  return parseTrackerAccess(data, expectedOwner);
}

export async function fetchTrackerTargets(kind: 'habit' | 'chain', ids: readonly string[], expectedOwner: string): Promise<TrackerTarget[]> {
  if ((kind !== 'habit' && kind !== 'chain') || !Array.isArray(ids) || ids.some(i => typeof i !== 'string' || !UUID.test(i))) {
    throw new Error(TRACKER_ACCESS_MESSAGE);
  }
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return [];
  const authorization = await authorizationForOwner(expectedOwner, TRACKER_ACCESS_MESSAGE);
  const result: TrackerTarget[] = [];
  for (let start = 0; start < wanted.length; start += TARGET_CHUNK) {
    const chunk = wanted.slice(start, start + TARGET_CHUNK);
    const {data, error} = await supabase.rpc('get_tracker_targets', {p_kind: kind, p_ids: chunk}).setHeader('Authorization', authorization);
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== chunk.length) throw new Error(TRACKER_ACCESS_MESSAGE);
    const byId = new Map<string, TrackerTarget>();
    for (const row of data as unknown[]) {
      if (!isRecord(row) || row.kind !== kind || typeof row.id !== 'string' || !chunk.includes(row.id) || byId.has(row.id)
        || (row.inputKind !== 'basic' && row.inputKind !== 'custom') || typeof row.canWrite !== 'boolean') {
        throw new Error(TRACKER_ACCESS_MESSAGE);
      }
      byId.set(row.id, {kind, id: row.id, inputKind: row.inputKind, canWrite: row.canWrite});
    }
    for (const id of chunk) {
      const target = byId.get(id);
      if (!target) throw new Error(TRACKER_ACCESS_MESSAGE);
      result.push(target);
    }
  }
  return result;
}

export async function setTrackerConsent(purpose: TrackerPurpose, granted: boolean, noticeVersion: string, expected: TrackerRevision): Promise<TrackerAccess> {
  if (!Object.prototype.hasOwnProperty.call(TRACKER_NOTICE_VERSIONS, purpose)
    || noticeVersion !== TRACKER_NOTICE_VERSIONS[purpose] || typeof granted !== 'boolean') {
    throw new Error(CONSENT_NOTICE_MESSAGE);
  }
  // Capture before the first await so a mutable UI object cannot retarget the request.
  const captured = copyTrackerRevision(expected);
  const authorization = await authorizationForOwner(captured.userId, TRACKER_ACCESS_MESSAGE);
  const {data, error} = await supabase.rpc('set_tracker_processing_consent', {
    p_purpose: purpose, p_granted: granted, p_notice_version: noticeVersion, p_expected: {...captured},
  }).setHeader('Authorization', authorization);
  if (error) throw error;
  const status = parseTrackerAccess(data, captured.userId);
  const field = purpose === 'custom-tracker' ? 'customConsent' : 'fitnessConsent';
  if (status.revision.ageVersion !== captured.ageVersion || status.revision.authorityVersion !== captured.authorityVersion
    || status.revision.consentVersion < captured.consentVersion || status[field] !== granted) {
    throw new Error(TRACKER_ACCESS_MESSAGE);
  }
  listeners.forEach(listener => {try {listener();} catch { /* Observers cannot undo an accepted mutation. */ }});
  return status;
}

export function subscribeTrackerAccessChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => {listeners.delete(listener);};
}

/** A detached, validated four-field copy. Take it before any await. */
export function copyTrackerRevision(revision: TrackerRevision): TrackerRevision {
  return parseRevision(revision);
}

export function toTargetSnapshot(target: TrackerTarget): TrackerTargetSnapshot {
  return {kind: target.kind, id: target.id, inputKind: target.inputKind};
}
