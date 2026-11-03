import { supabase } from '../supabase/client';
export interface MailboxStatus { userId: string; version: number; verified: boolean; }
export const MAILBOX_MESSAGE = 'Verify your email to access your weekly debrief.';
const listeners = new Set<() => void>();
export function subscribeMailboxChanges(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export async function fetchMailboxStatus(): Promise<MailboxStatus> {
  const { data, error } = await supabase.rpc('get_mailbox_status');
  if (error) throw error;
  const value = data as unknown as MailboxStatus;
  if (!value || typeof value.userId !== 'string' || !value.userId || typeof value.verified !== 'boolean' ||
    !Number.isSafeInteger(value.version) || value.version < 1) throw new Error('Email verification status is unavailable.');
  return value;
}
export async function requireMailboxProof(expected?: Pick<MailboxStatus, 'userId' | 'version'>): Promise<MailboxStatus> {
  const status = await fetchMailboxStatus();
  if (!status.verified || (expected && (status.userId !== expected.userId || status.version !== expected.version))) throw new Error(MAILBOX_MESSAGE);
  return status;
}
async function invoke(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('mailbox-verification', { body });
  if (error) {
    let message = 'Email verification is temporarily unavailable. Please try again later.';
    // Only the endpoint's public message is presented, never serialized Auth
    // error details or logged response/session data.
    try {
      const context = (error as { context?: Response }).context;
      if (context) { const payload = await context.json(); if (typeof payload?.error === 'string') message = payload.error; }
    } catch { /* Keep the generic error. */ }
    throw new Error(message);
  }
  if (!data || typeof data !== 'object') throw new Error('Email verification is temporarily unavailable.');
  return data;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function sendMailboxCode(): Promise<{ challengeId: string; retryAfter: number }> {
  const data = await invoke({ action: 'send' });
  if (typeof data.challengeId !== 'string' || !UUID.test(data.challengeId) || typeof data.retryAfter !== 'number' ||
    !Number.isSafeInteger(data.retryAfter) || data.retryAfter < 1 || data.retryAfter > 600) throw new Error('Email verification is temporarily unavailable.');
  return { challengeId: data.challengeId, retryAfter: data.retryAfter };
}
export async function verifyMailboxCode(challengeId: string, code: string, expected?: Pick<MailboxStatus, 'userId' | 'version'>): Promise<MailboxStatus> {
  if (!UUID.test(challengeId) || !/^\d{6,10}$/.test(code)) throw new Error('Enter the code from your verification email.');
  const data = await invoke({ action: 'verify', challengeId, code });
  if (data.verified !== true) throw new Error('That code could not be verified.');
  const status = await requireMailboxProof(expected);
  listeners.forEach(listener => { try { listener(); } catch { /* Observers cannot undo proof. */ } });
  return status;
}
