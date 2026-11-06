import { supabase } from '../supabase/client';
import { validateBirthday } from '../logic/validation';

export interface AccountAge {
  userId: string;
  birthDate: string | null;
  pendingBirthDate: string | null;
  correctionPending: boolean;
  /** Declaration only, not proof or a substitute for the rollout assurance gate. */
  adultDeclared: boolean;
  /** Absent on older servers; absence does not establish tracker-write access. */
  trackerWritesPaused?: boolean;
  version: number;
}
export const ADULT_AI_MESSAGE = 'AI access requires an adult birthday declaration with no pending correction. You can update your birthday in Profile.';
const ageListeners = new Set<() => void>();
export function subscribeAccountAgeChanges(listener: () => void): () => void {
  ageListeners.add(listener);
  return () => { ageListeners.delete(listener); };
}

export function parseAccountAge(data: unknown): AccountAge {
  if (!data || typeof data !== 'object') throw new Error('Birthday status is unavailable.');
  const value = data as AccountAge;
  if (typeof value.userId !== 'string' || !value.userId ||
    typeof value.adultDeclared !== 'boolean' || typeof value.correctionPending !== 'boolean' ||
    (value.trackerWritesPaused !== undefined && typeof value.trackerWritesPaused !== 'boolean') ||
    !Number.isSafeInteger(value.version) || value.version < 0 ||
    (value.birthDate !== null && (typeof value.birthDate !== 'string' || validateBirthday(value.birthDate))) ||
    (value.pendingBirthDate !== null && (typeof value.pendingBirthDate !== 'string' || validateBirthday(value.pendingBirthDate)))) {
    throw new Error('Birthday status is unavailable.');
  }
  return value;
}
export async function fetchAccountAge(): Promise<AccountAge> {
  const { data, error } = await supabase.rpc('get_account_age');
  if (error) throw error;
  return parseAccountAge(data);
}
export async function setAccountBirthday(birthDate: string, expectedUserId?: string): Promise<AccountAge> {
  const validation = validateBirthday(birthDate);
  if (validation) throw new Error(validation);
  const { data, error } = await supabase.rpc('set_account_birthday', {
    p_birth_date: birthDate, ...(expectedUserId ? { p_expected_user_id: expectedUserId } : {}),
  });
  if (error) throw error;
  const status = parseAccountAge(data);
  notifyAccountAgeChanged();
  return status;
}
/** Tells birthday observers about a save made elsewhere (the Google finish call). */
export function notifyAccountAgeChanged(): void {
  ageListeners.forEach(listener => { try { listener(); } catch { /* A UI observer cannot undo the server save. */ } });
}
export async function requireAdultDeclaration(expected?: Pick<AccountAge, 'userId' | 'version'>): Promise<AccountAge> {
  const status = await fetchAccountAge();
  if (!status.birthDate || !status.adultDeclared || status.correctionPending ||
    (expected && (status.userId !== expected.userId || status.version !== expected.version))) {
    throw new Error(ADULT_AI_MESSAGE);
  }
  return status;
}
