import { formatError } from './format-error';

/**
 * Hunter-voice copy for the auth screen's outcome notices and errors
 * (redesign spec section 5). Lives in shared/ rather than the web screen
 * file so it can be unit-tested without pulling in the web app's
 * Supabase-backed module graph, and so mobile's later redesign can reuse
 * the exact same lines.
 */
export type AuthMode = 'login' | 'signup' | 'forgot';

export function resetLinkSentMessage(email: string): string {
  return `A reset link is on its way to you, Hunter — check ${email}.`;
}

export function confirmEmailMessage(email: string): string {
  return `A confirmation link is waiting at ${email} — confirm it, then step into the System.`;
}

export function authErrorMessage(mode: AuthMode, err: unknown): string {
  const detail = formatError(err);
  if (mode === 'signup') return `The System couldn't complete your enrollment — ${detail}`;
  if (mode === 'forgot') return `The System couldn't send the link — ${detail}`;
  return `The System refuses entry — ${detail}`;
}
