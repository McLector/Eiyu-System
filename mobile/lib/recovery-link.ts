import {parseRecoveryLink, RECOVERY_LINK_ERROR, type RecoveryTokens} from '@eiyu/shared';

let revision = 0;
let pending: {id: string; tokens: RecoveryTokens | null} | null = null;

/** Native Router drops custom-scheme fragments. Transfer credentials only in RAM. */
export function redirectRecoveryLink(path: string, target: string): string {
 try {
  const url = new URL(path), expected = new URL(target);
  if (url.protocol !== expected.protocol || url.host !== expected.host || url.pathname !== expected.pathname) return path;
 } catch {return path;}
 let tokens: RecoveryTokens | null = null;
 try {tokens = parseRecoveryLink(path, target);} catch { /* Render the generic invalid-link state. */ }
 const id = String(++revision);
 pending = {id, tokens};
 // Nonsecret revision remounts an already-open recovery form for a fresh link.
 return `/auth/recovery?attempt=${id}`;
}

export function consumeRecoveryLink(id: string | undefined): RecoveryTokens {
 if (!id || pending?.id !== id) throw new Error(RECOVERY_LINK_ERROR);
 const tokens = pending.tokens;
 pending = null;
 if (!tokens) throw new Error(RECOVERY_LINK_ERROR);
 return tokens;
}
