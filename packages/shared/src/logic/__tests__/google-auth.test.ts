import {
  GOOGLE_CANCELLED_MESSAGE,
  GOOGLE_EMAIL_UNVERIFIED_MESSAGE,
  GOOGLE_GENERIC_MESSAGE,
  GOOGLE_LINK_REFUSED_MESSAGE,
  classifyGoogleSignInError,
  googleSignInErrorMessage,
  needsGoogleSignupFinish,
  readOAuthErrorParams,
} from '../google-auth';

// The exact shape GoTrue v2.196.0 sent when the identities trigger refused a link (T4, real login).
const REFUSAL = {error: 'server_error', error_code: 'unexpected_failure', error_description: 'Error creating identity'};

describe('readOAuthErrorParams', () => {
  it('reads error parameters from the query', () => {
    expect(readOAuthErrorParams('eiyu://auth/callback?error=server_error&error_code=unexpected_failure&error_description=Error+creating+identity'))
      .toEqual(REFUSAL);
  });

  it('reads error parameters from the hash', () => {
    expect(readOAuthErrorParams('https://app.example/auth/callback#error=server_error&error_code=unexpected_failure&error_description=Error+creating+identity'))
      .toEqual(REFUSAL);
  });

  it('merges query and hash, preferring the query when both name the same key', () => {
    expect(readOAuthErrorParams('https://app.example/cb?error=access_denied#error=server_error&error_code=unexpected_failure'))
      .toEqual({error: 'access_denied', error_code: 'unexpected_failure', error_description: null});
  });

  it('returns null when there is no error parameter', () => {
    expect(readOAuthErrorParams('https://app.example/auth/callback?code=abc123')).toBeNull();
    expect(readOAuthErrorParams('https://app.example/auth/callback#access_token=x')).toBeNull();
  });

  it('returns null for empty, whitespace and non-URL input', () => {
    expect(readOAuthErrorParams('')).toBeNull();
    expect(readOAuthErrorParams('   ')).toBeNull();
    expect(readOAuthErrorParams('not a url')).toBeNull();
    expect(readOAuthErrorParams(undefined as unknown as string)).toBeNull();
    expect(readOAuthErrorParams(null as unknown as string)).toBeNull();
  });

  it('treats blank values as absent', () => {
    expect(readOAuthErrorParams('https://app.example/cb?error=&error_code=%20')).toBeNull();
  });
});

describe('classifyGoogleSignInError', () => {
  it('recognises the refused-link shape from the real login', () => {
    expect(classifyGoogleSignInError(REFUSAL)).toBe('link-refused');
  });

  it('recognises the refusal by its description alone, ignoring case', () => {
    expect(classifyGoogleSignInError({error_description: 'error creating identity'})).toBe('link-refused');
  });

  it('does not call a different unexpected_failure a refused link', () => {
    expect(classifyGoogleSignInError({error: 'server_error', error_code: 'unexpected_failure', error_description: 'Database error saving new user'}))
      .toBe('generic');
    expect(classifyGoogleSignInError({error: 'server_error', error_code: 'unexpected_failure'})).toBe('generic');
  });

  it('recognises the hook text for an unverified Google email', () => {
    expect(classifyGoogleSignInError({
      error: 'access_denied',
      error_description: 'Google says this email is not verified. Verify it with Google, then try again.',
    })).toBe('email-unverified');
  });

  it('treats access_denied without the hook text as the user cancelling', () => {
    expect(classifyGoogleSignInError({error: 'access_denied'})).toBe('cancelled');
    expect(classifyGoogleSignInError({error: 'access_denied', error_description: 'The user denied access'})).toBe('cancelled');
  });

  it('falls back to generic for unknown codes, empty objects and nullish input', () => {
    expect(classifyGoogleSignInError({error: 'temporarily_unavailable'})).toBe('generic');
    expect(classifyGoogleSignInError({})).toBe('generic');
    expect(classifyGoogleSignInError(null)).toBe('generic');
    expect(classifyGoogleSignInError(undefined)).toBe('generic');
  });
});

describe('googleSignInErrorMessage', () => {
  it('uses the exact combined message for a refused link', () => {
    expect(GOOGLE_LINK_REFUSED_MESSAGE).toBe(
      "Google couldn't connect to this email. If you already have an Eiyu account, sign in with your password and verify your email first, then use Google.",
    );
    expect(googleSignInErrorMessage(REFUSAL)).toBe(GOOGLE_LINK_REFUSED_MESSAGE);
  });

  it('gives each failure its own message', () => {
    expect(googleSignInErrorMessage({error: 'access_denied'})).toBe(GOOGLE_CANCELLED_MESSAGE);
    expect(googleSignInErrorMessage({error: 'access_denied', error_description: 'Google says this email is not verified. Verify it with Google, then try again.'}))
      .toBe(GOOGLE_EMAIL_UNVERIFIED_MESSAGE);
    expect(googleSignInErrorMessage({error: 'nope'})).toBe(GOOGLE_GENERIC_MESSAGE);
  });

  it('accepts an already-classified failure', () => {
    expect(googleSignInErrorMessage('cancelled')).toBe(GOOGLE_CANCELLED_MESSAGE);
    expect(googleSignInErrorMessage('link-refused')).toBe(GOOGLE_LINK_REFUSED_MESSAGE);
  });

  it('never leaks the raw provider description', () => {
    const message = googleSignInErrorMessage({error: 'server_error', error_description: 'secret internal detail xyz'});
    expect(message).toBe(GOOGLE_GENERIC_MESSAGE);
    expect(message).not.toContain('xyz');
  });

  it('handles empty and nullish input with the generic message', () => {
    expect(googleSignInErrorMessage({})).toBe(GOOGLE_GENERIC_MESSAGE);
    expect(googleSignInErrorMessage(null)).toBe(GOOGLE_GENERIC_MESSAGE);
    expect(googleSignInErrorMessage(undefined)).toBe(GOOGLE_GENERIC_MESSAGE);
  });
});

describe('needsGoogleSignupFinish', () => {
  const google = {app_metadata: {provider: 'google', providers: ['google']}};
  const password = {app_metadata: {provider: 'email', providers: ['email']}};

  it('is true for a Google-created account without age consent', () => {
    expect(needsGoogleSignupFinish(google, {ageConsent: false})).toBe(true);
  });

  it('is false for a Google-created account that has age consent', () => {
    expect(needsGoogleSignupFinish(google, {ageConsent: true})).toBe(false);
  });

  it('is false for a password account without consent, so legacy accounts skip the screen', () => {
    expect(needsGoogleSignupFinish(password, {ageConsent: false})).toBe(false);
  });

  it('is false for a password account that linked Google later', () => {
    expect(needsGoogleSignupFinish({app_metadata: {provider: 'email', providers: ['email', 'google']}}, {ageConsent: false})).toBe(false);
  });

  it('does not trust user_metadata claiming Google', () => {
    expect(needsGoogleSignupFinish({app_metadata: {provider: 'email'}, user_metadata: {provider: 'google'}} as never, {ageConsent: false})).toBe(false);
  });

  it('is false when the user or the status is missing', () => {
    expect(needsGoogleSignupFinish(null, {ageConsent: false})).toBe(false);
    expect(needsGoogleSignupFinish(undefined, {ageConsent: false})).toBe(false);
    expect(needsGoogleSignupFinish(google, null)).toBe(false);
    expect(needsGoogleSignupFinish(google, undefined)).toBe(false);
  });

  it('is false for malformed input rather than throwing', () => {
    expect(needsGoogleSignupFinish({} as never, {ageConsent: false})).toBe(false);
    expect(needsGoogleSignupFinish({app_metadata: null} as never, {ageConsent: false})).toBe(false);
    expect(needsGoogleSignupFinish(google, {} as never)).toBe(false);
    expect(needsGoogleSignupFinish(google, {ageConsent: 'false'} as never)).toBe(false);
  });
});
