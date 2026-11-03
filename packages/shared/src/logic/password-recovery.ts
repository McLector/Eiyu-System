import { validateConfirmPassword, validatePassword } from './validation';

export const RECOVERY_LINK_ERROR = 'This recovery link is invalid or expired. Request a new link.';
const OWNER_ERROR = 'Sign out of the other account before opening this recovery link.';
const SAVE_ERROR = 'Your password could not be updated. Try again or request a new recovery link.';
export interface RecoveryTokens {access_token: string; refresh_token: string}
/** A separate, nonpersistent Auth client; never pass the normal app client here. */
export interface RecoveryAuth {
 setSession(tokens: RecoveryTokens): Promise<{data: {user: {id: string} | null; session: {user: {id: string}} | null}; error: unknown}>;
 getUser(): Promise<{data: {user: {id: string} | null}; error: unknown}>;
 updateUser(input: {password: string}): Promise<{data: {user: {id: string} | null}; error: unknown}>;
 signOut(options: {scope: 'local'}): Promise<{error: unknown}>;
}

export function parseRecoveryLink(raw: string, target: string): RecoveryTokens {
 try {
  const url = new URL(raw), expected = new URL(target);
  if (url.protocol !== expected.protocol || url.host !== expected.host || url.pathname !== expected.pathname ||
      url.username || url.password || url.search) throw new Error();
  const params = new URLSearchParams(url.hash.slice(1));
  if (params.has('error') || params.has('error_code') || params.get('type') !== 'recovery' || params.get('token_type') !== 'bearer') throw new Error();
  for (const name of ['access_token', 'refresh_token', 'type', 'token_type']) {
   if (params.getAll(name).length !== 1 || !params.get(name)?.trim()) throw new Error();
  }
  return {access_token: params.get('access_token')!, refresh_token: params.get('refresh_token')!};
 } catch { throw new Error(RECOVERY_LINK_ERROR); }
}

async function checkOwner(owner: string, currentOwner: () => Promise<string | null>) {
 let current: string | null;
 try { current = await currentOwner(); } catch { throw new Error('Account status is unavailable. Try opening the recovery link again.'); }
 if (current && current !== owner) throw new Error(OWNER_ERROR);
}

export async function beginPasswordRecovery(auth: RecoveryAuth, tokens: RecoveryTokens, currentOwner: () => Promise<string | null>): Promise<string> {
 let owner: string;
 try {
  const {data, error} = await auth.setSession(tokens);
  if (error || !data.user?.id || data.session?.user.id !== data.user.id) throw new Error();
  owner = data.user.id;
 } catch { throw new Error(RECOVERY_LINK_ERROR); }
 await checkOwner(owner, currentOwner);
 return owner;
}

export async function saveRecoveredPassword(auth: RecoveryAuth, owner: string, password: string, confirmation: string, currentOwner: () => Promise<string | null>): Promise<{cleanupFailed: boolean}> {
 const validation = validatePassword(password) ?? validateConfirmPassword(password, confirmation);
 if (validation) throw new Error(validation);
 try {
  const {data, error} = await auth.getUser();
  if (error || data.user?.id !== owner) throw new Error();
 } catch { throw new Error(RECOVERY_LINK_ERROR); }
 await checkOwner(owner, currentOwner);
 try {
  const {data, error} = await auth.updateUser({password});
  if (error || data.user?.id !== owner) throw new Error();
 } catch { throw new Error(SAVE_ERROR); }
 // An update already succeeded: cleanup failure must not invite another password update.
 try { return {cleanupFailed: !!(await auth.signOut({scope: 'local'})).error}; }
 catch { return {cleanupFailed: true}; }
}
