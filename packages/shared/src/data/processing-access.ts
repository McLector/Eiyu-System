import {supabase} from '../supabase/client';
import {AGE_NOTICE_VERSION, AI_NOTICE_VERSION} from '../logic/legal-content';

export interface ProcessingAccess {
  contractVersion: 1;
  userId: string;
  ageVersion: number;
  consentVersion: number;
  authorityVersion: number;
  mailboxVersion: number;
  ageEligible: boolean;
  canReadDebrief: boolean;
  canGenerateDebrief: boolean;
  authorityState: 'not-required' | 'pending' | 'approved' | 'revoked';
  ageConsent: boolean;
  aiConsent: boolean;
}

export const PROCESSING_ACCESS_MESSAGE = 'Debrief access needs a current birthday declaration, the applicable permissions and email verification. Review your choices in Profile.';
const INVALID_STATUS = 'Processing access is unavailable.';
const revisions = ['ageVersion', 'consentVersion', 'authorityVersion', 'mailboxVersion'] as const;
const decisions = ['ageEligible', 'canReadDebrief', 'canGenerateDebrief', 'ageConsent', 'aiConsent'] as const;
const listeners = new Set<() => void>();

function parseProcessingAccess(data: unknown): ProcessingAccess {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(INVALID_STATUS);
  const value = data as ProcessingAccess;
  if (value.contractVersion !== 1 || typeof value.userId !== 'string' || !value.userId.trim()
    || revisions.some(key => !Number.isSafeInteger(value[key]) || value[key] < 0)
    || decisions.some(key => typeof value[key] !== 'boolean')
    || !['not-required', 'pending', 'approved', 'revoked'].includes(value.authorityState)) {
    throw new Error(INVALID_STATUS);
  }
  const authorityAllowed = value.authorityState === 'not-required' || value.authorityState === 'approved';
  if ((value.canReadDebrief && (!value.ageEligible || !value.ageConsent || !authorityAllowed))
    || (value.canGenerateDebrief && (!value.canReadDebrief || !value.aiConsent))) {
    throw new Error(INVALID_STATUS);
  }
  // Project only the contract. Do not retain unexpected personal verification fields.
  return {
    contractVersion: 1, userId: value.userId, ageVersion: value.ageVersion,
    consentVersion: value.consentVersion, authorityVersion: value.authorityVersion,
    mailboxVersion: value.mailboxVersion, ageEligible: value.ageEligible,
    canReadDebrief: value.canReadDebrief, canGenerateDebrief: value.canGenerateDebrief,
    authorityState: value.authorityState, ageConsent: value.ageConsent, aiConsent: value.aiConsent,
  };
}

export async function fetchProcessingAccess(): Promise<ProcessingAccess> {
  const {data, error} = await supabase.rpc('get_processing_access');
  if (error) throw error;
  return parseProcessingAccess(data);
}

export async function requireDebriefAccess(kind: 'read' | 'generate', expected?: ProcessingAccess): Promise<ProcessingAccess> {
  if (kind !== 'read' && kind !== 'generate') throw new Error(PROCESSING_ACCESS_MESSAGE);
  // Capture before yielding; a mutable UI object cannot replace the original owner/revisions.
  const captured = expected === undefined ? undefined : parseProcessingAccess(expected);
  const status = await fetchProcessingAccess();
  if (!(kind === 'read' ? status.canReadDebrief : status.canGenerateDebrief)
    || (captured && (status.userId !== captured.userId || revisions.some(key => status[key] !== captured[key])))) {
    throw new Error(PROCESSING_ACCESS_MESSAGE);
  }
  return status;
}

export async function setProcessingConsent(purpose: 'age-screening' | 'weekly-debrief', granted: boolean,
  noticeVersion: string, expected: ProcessingAccess): Promise<ProcessingAccess> {
  const requiredNotice = purpose === 'age-screening' ? AGE_NOTICE_VERSION
    : purpose === 'weekly-debrief' ? AI_NOTICE_VERSION : null;
  if (!requiredNotice || noticeVersion !== requiredNotice || typeof granted !== 'boolean') {
    throw new Error('Review the current notice before changing this permission.');
  }
  const captured = parseProcessingAccess(expected);
  const {data, error} = await supabase.rpc('set_processing_consent', {
    p_purpose: purpose, p_granted: granted, p_notice_version: noticeVersion,
    p_expected_user_id: captured.userId, p_expected_age_version: captured.ageVersion,
    p_expected_consent_version: captured.consentVersion, p_expected_authority_version: captured.authorityVersion,
    p_expected_mailbox_version: captured.mailboxVersion,
  });
  if (error) throw error;
  const status = parseProcessingAccess(data);
  const grantedField = purpose === 'age-screening' ? 'ageConsent' : 'aiConsent';
  if (status.userId !== captured.userId || status.ageVersion !== captured.ageVersion
    || status.authorityVersion !== captured.authorityVersion || status.mailboxVersion !== captured.mailboxVersion
    || status.consentVersion < captured.consentVersion || status[grantedField] !== granted) {
    throw new Error(PROCESSING_ACCESS_MESSAGE);
  }
  listeners.forEach(listener => {try {listener();} catch { /* Observers cannot undo an accepted mutation. */ }});
  return status;
}

export function subscribeProcessingAccessChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => {listeners.delete(listener);};
}
