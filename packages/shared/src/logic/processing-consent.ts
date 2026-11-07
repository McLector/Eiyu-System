import {TERMS_VERSION} from './legal-content';

/**
 * Sign-up metadata: the Terms version the person agreed to. The server records it (with its own time) when the
 * account is created. No birthday and no other consent travels with a sign-up.
 */
export function signupMetadata(): {terms: {version: string}} {
  return {terms: {version: TERMS_VERSION}};
}
