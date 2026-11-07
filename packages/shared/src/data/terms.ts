import {supabase} from '../supabase/client';
import {TERMS_VERSION} from '../logic/legal-content';

export interface TermsStatus {
  userId: string;
  accepted: boolean;
  /** The version held on the server: the current one, or an earlier one for accounts that existed before it. */
  version: string | null;
}

const INVALID_STATUS = 'Terms status is unavailable.';
const NOT_SAVED = 'Could not save your agreement.';

// Project only the contract. "Accepted" must go with a version, and "not accepted" with none.
function parseTermsStatus(data: unknown): TermsStatus | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const {userId, accepted, version} = data as Record<string, unknown>;
  if (typeof userId !== 'string' || !userId.trim() || typeof accepted !== 'boolean') return null;
  if (accepted ? (typeof version !== 'string' || !version) : version !== null && version !== undefined) return null;
  return {userId, accepted, version: accepted ? (version as string) : null};
}

export async function fetchTermsStatus(): Promise<TermsStatus> {
  const {data, error} = await supabase.rpc('get_terms_status');
  if (error) throw error;
  const status = parseTermsStatus(data);
  if (!status) throw new Error(INVALID_STATUS);
  return status;
}

/**
 * Records acceptance of the current Terms. Pass the signed-in person's id when you have it: a confirmation for
 * anyone else, or for any other version, is refused so the screen never closes on the wrong answer.
 */
export async function acceptTerms(expectedUserId?: string): Promise<TermsStatus & {accepted: true; version: string}> {
  const {data, error} = await supabase.rpc('accept_terms', {p_version: TERMS_VERSION});
  if (error) throw error;
  const status = parseTermsStatus(data);
  if (!status || !status.accepted || status.version !== TERMS_VERSION
    || (expectedUserId !== undefined && status.userId !== expectedUserId)) {
    throw new Error(NOT_SAVED);
  }
  return {userId: status.userId, accepted: true, version: status.version};
}
