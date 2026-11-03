import {supabase} from '../supabase/client';
import {authorizationForOwner} from '../supabase/authorization';

export type ReviewPurpose = 'custom-tracker' | 'fitness-tracking' | 'weekly-debrief';
export type ReviewStatus = 'open' | 'approved' | 'denied' | 'withdrawn';
export type ReviewDecision = 'approved' | 'denied';
export type AgeBand = 'teen' | 'adult' | 'unknown';
export type OperatorAal = 'aal1' | 'aal2';
export type RetentionPurpose = 'custom-tracker' | 'fitness-tracking';

export interface OperatorStatus {isOperator: boolean; mfaRequired: boolean; aal: OperatorAal}
export interface ReviewRequestRow {
  id: string; email: string; ageBand: AgeBand; purpose: ReviewPurpose; note: string; createdAt: string;
}
export interface RetentionRow {
  email: string; purpose: RetentionPurpose; withdrawnAt: string; reminderDueOn: string; removalDueOn: string; status: string;
}
export interface RetentionNotice {purpose: RetentionPurpose; removalDueOn: string; reminded: boolean}
export interface MyReviewRequest {requestId: string; purpose: ReviewPurpose; status: ReviewStatus; createdAt: string}

export const OPERATOR_MESSAGE = 'Operator action unavailable.';
export const REVIEW_NOTE_MAX = 280;
export const REVIEW_PURPOSES: readonly ReviewPurpose[] = ['custom-tracker', 'fitness-tracking', 'weekly-debrief'];
export const PAUSE_REASON_CODES = ['dispute', 'report', 'other'] as const;
export type PauseReasonCode = typeof PAUSE_REASON_CODES[number];

export type OperatorErrorKind = 'denied' | 'invalid' | 'limit' | 'already-open' | 'not-needed' | 'unavailable';
/** A fixed-text failure. It never carries server text, payloads, emails or ids. */
export class OperatorError extends Error {
  readonly kind: OperatorErrorKind;
  constructor(kind: OperatorErrorKind = 'unavailable', message: string = OPERATOR_MESSAGE) {
    super(message);
    this.name = 'OperatorError';
    this.kind = kind;
  }
}

const STATUSES: readonly string[] = ['open', 'approved', 'denied', 'withdrawn'];
const DECISIONS: readonly string[] = ['approved', 'denied'];
const AGE_BANDS: readonly string[] = ['teen', 'adult', 'unknown'];
const RETENTION_PURPOSES: readonly string[] = ['custom-tracker', 'fitness-tracking'];
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+$/;
const EMAIL_MAX = 320;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
const isStr = (v: unknown): v is string => typeof v === 'string';
const isInstant = (v: unknown): v is string => isStr(v) && v.length <= 40 && !Number.isNaN(Date.parse(v));
const isDay = (v: unknown): v is string => isStr(v) && DAY.test(v) && !Number.isNaN(Date.parse(v));
const bad = (): never => { throw new OperatorError(); };

/** Map a server failure to fixed text. Nothing from the server's message is kept. */
function serverFailure(error: unknown): OperatorError {
  const code = isRecord(error) && isStr(error.code) ? error.code : '';
  if (code === '42501') return new OperatorError('denied', 'Operator access required.');
  if (code === '22023') return new OperatorError('invalid', 'That request is not valid.');
  if (code === 'ER001') return new OperatorError('limit', 'Too many review requests today. Try again tomorrow.');
  if (code === 'ER002') return new OperatorError('already-open', 'A review request is already open.');
  if (code === 'ER003') return new OperatorError('not-needed', 'No review is needed for this permission.');
  return new OperatorError();
}

async function call(owner: string, name: string, args?: Record<string, unknown>): Promise<unknown> {
  let authorization: string;
  try { authorization = await authorizationForOwner(owner, OPERATOR_MESSAGE); } catch { throw new OperatorError(); }
  // The builder types are narrow per function; names here are fixed strings from this module.
  const client = supabase as unknown as {rpc: (n: string, a?: Record<string, unknown>) => {setHeader: (k: string, v: string) => PromiseLike<{data: unknown; error: unknown}>}};
  const builder = args === undefined ? client.rpc(name) : client.rpc(name, args);
  const {data, error} = await builder.setHeader('Authorization', authorization);
  if (error) throw serverFailure(error);
  return data;
}

function checkPurpose(purpose: unknown): asserts purpose is ReviewPurpose {
  if (!isStr(purpose) || !REVIEW_PURPOSES.includes(purpose as ReviewPurpose)) bad();
}

export async function fetchOperatorStatus(owner: string): Promise<OperatorStatus> {
  const data = await call(owner, 'get_operator_status');
  if (!isRecord(data) || typeof data.isOperator !== 'boolean' || typeof data.mfaRequired !== 'boolean'
    || (data.aal !== 'aal1' && data.aal !== 'aal2')) bad();
  const v = data as Record<string, unknown>;
  return {isOperator: v.isOperator as boolean, mfaRequired: v.mfaRequired as boolean, aal: v.aal as OperatorAal};
}

export async function requestAuthorityReview(purpose: ReviewPurpose, note: string | undefined, owner: string): Promise<void> {
  checkPurpose(purpose);
  const trimmed = (note ?? '').trim();
  if (trimmed.length > REVIEW_NOTE_MAX) throw new OperatorError('invalid', `Keep the note to ${REVIEW_NOTE_MAX} characters or fewer.`);
  await call(owner, 'request_authority_review', {p_purpose: purpose, p_note: trimmed});
}

export async function cancelAuthorityReview(purpose: ReviewPurpose, owner: string): Promise<void> {
  checkPurpose(purpose);
  await call(owner, 'cancel_authority_review', {p_purpose: purpose});
}

/** The caller's own open requests and latest decided one per purpose. Never includes the note. */
export async function fetchMyReviewRequests(owner: string): Promise<MyReviewRequest[]> {
  const data = await call(owner, 'get_my_review_requests');
  if (!Array.isArray(data)) return bad();
  return data.map((row: unknown): MyReviewRequest => {
    if (!isRecord(row) || !isStr(row.requestId) || !UUID.test(row.requestId) || !isStr(row.purpose)
      || !REVIEW_PURPOSES.includes(row.purpose as ReviewPurpose) || !isStr(row.status) || !STATUSES.includes(row.status)
      || !isInstant(row.createdAt)) return bad();
    return {requestId: row.requestId, purpose: row.purpose as ReviewPurpose, status: row.status as ReviewStatus, createdAt: row.createdAt};
  });
}

export async function fetchRetentionNotice(owner: string): Promise<RetentionNotice[]> {
  const data = await call(owner, 'get_tracker_retention_notice');
  if (data === null || data === undefined) return [];
  if (!Array.isArray(data)) return bad();
  return data.map((row: unknown): RetentionNotice => {
    if (!isRecord(row) || !isStr(row.purpose) || !RETENTION_PURPOSES.includes(row.purpose)
      || !isDay(row.removalDueOn) || typeof row.reminded !== 'boolean') return bad();
    return {purpose: row.purpose as RetentionPurpose, removalDueOn: row.removalDueOn, reminded: row.reminded};
  });
}

export async function listReviewRequests(status: ReviewStatus, owner: string): Promise<ReviewRequestRow[]> {
  if (!STATUSES.includes(status)) bad();
  const data = await call(owner, 'operator_list_review_requests', {p_status: status});
  if (!Array.isArray(data)) return bad();
  return data.map((row: unknown): ReviewRequestRow => {
    const emailOk = row !== null && isRecord(row) && (isStr(row.email) || row.email === null);
    const noteOk = isRecord(row) && (isStr(row.note) || row.note === null);
    if (!isRecord(row) || !isStr(row.requestId) || !UUID.test(row.requestId) || !emailOk || !isStr(row.ageBand)
      || !AGE_BANDS.includes(row.ageBand) || !isStr(row.purpose) || !REVIEW_PURPOSES.includes(row.purpose as ReviewPurpose)
      || !noteOk || !isInstant(row.createdAt)) return bad();
    return {
      id: row.requestId, email: (row.email as string | null) ?? '', ageBand: row.ageBand as AgeBand,
      purpose: row.purpose as ReviewPurpose, note: (row.note as string | null) ?? '', createdAt: row.createdAt,
    };
  });
}

export async function decideReview(requestId: string, decision: ReviewDecision, owner: string): Promise<void> {
  if (!isStr(requestId) || !UUID.test(requestId) || !DECISIONS.includes(decision)) bad();
  await call(owner, 'operator_decide_review', {p_request_id: requestId, p_decision: decision});
}

/** Whether the text can name an account for a pause: an account id or an email address. */
export function isPauseAccount(account: unknown): account is string {
  if (!isStr(account)) return false;
  const value = account.trim();
  return UUID.test(value) || (value.length <= EMAIL_MAX && EMAIL.test(value));
}

/** Names the account by id or by email. The server takes exactly one and refuses an unknown one generically. */
export async function pausePurpose(account: string, purpose: ReviewPurpose, reason: PauseReasonCode, owner: string): Promise<void> {
  if (!isPauseAccount(account) || !PAUSE_REASON_CODES.includes(reason)) bad();
  checkPurpose(purpose);
  const value = account.trim();
  await call(owner, 'operator_pause_purpose', UUID.test(value)
    ? {p_user_id: value, p_purpose: purpose, p_reason_code: reason}
    : {p_user_id: null, p_email: value, p_purpose: purpose, p_reason_code: reason});
}

/** Lifts a pause, naming the account the same way. The server refuses a purpose that is not paused. */
export async function resumePurpose(account: string, purpose: ReviewPurpose, owner: string): Promise<void> {
  if (!isPauseAccount(account)) bad();
  checkPurpose(purpose);
  const value = account.trim();
  await call(owner, 'operator_resume_purpose', UUID.test(value)
    ? {p_user_id: value, p_purpose: purpose}
    : {p_user_id: null, p_email: value, p_purpose: purpose});
}

export async function listRetention(owner: string): Promise<RetentionRow[]> {
  const data = await call(owner, 'operator_list_retention');
  if (!Array.isArray(data)) return bad();
  return data.map((row: unknown): RetentionRow => {
    if (!isRecord(row) || !(isStr(row.email) || row.email === null) || !isStr(row.purpose) || !RETENTION_PURPOSES.includes(row.purpose)
      || !isInstant(row.withdrawnAt) || !isDay(row.reminderDueOn) || !isDay(row.removalDueOn) || !isStr(row.status)) return bad();
    return {
      email: (row.email as string | null) ?? '', purpose: row.purpose as RetentionPurpose, withdrawnAt: row.withdrawnAt,
      reminderDueOn: row.reminderDueOn, removalDueOn: row.removalDueOn, status: row.status,
    };
  });
}
