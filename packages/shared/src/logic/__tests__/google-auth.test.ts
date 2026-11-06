import {
  GOOGLE_CANCELLED_MESSAGE,
  GOOGLE_EMAIL_UNVERIFIED_MESSAGE,
  GOOGLE_EXPIRED_MESSAGE,
  GOOGLE_GENERIC_MESSAGE,
  GOOGLE_LINK_REFUSED_MESSAGE,
  classifyGoogleSignInError,
  googleSignInErrorMessage,
  needsGoogleSignupFinish,
  readExpiredGoogleSignIn,
  readOAuthErrorParams,
} from '../google-auth';

// The exact shape GoTrue v2.196.0 sent when the identities trigger refused a link (T4, real login).
const REFUSAL = {error: 'server_error', error_code: 'unexpected_failure', error_description: 'Error creating identity'};
// What GoTrue sent to the site URL when Google's account chooser was left open too long (2026-11-07, real login).
const EXPIRED = {error: 'invalid_request', error_code: 'bad_oauth_state', error_description: 'OAuth state has expired'};
const EXPIRED_QUERY = '?error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+has+expired';

describe('readExpiredGoogleSignIn', () => {
  it('finds the expired shape in the query of the site URL', () => {
    expect(readExpiredGoogleSignIn(`https://eiyu-system.vercel.app/auth${EXPIRED_QUERY}`)).toBe(true);
  });

  it('finds it in the hash too', () => {
    expect(readExpiredGoogleSignIn(`https://eiyu-system.vercel.app/auth#${EXPIRED_QUERY.slice(1)}`)).toBe(true);
  });

  it('ignores other errors that can land on the sign-in page, such as an expired email link', () => {
    expect(readExpiredGoogleSignIn('https://eiyu-system.vercel.app/auth#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')).toBe(false);
    expect(readExpiredGoogleSignIn('https://eiyu-system.vercel.app/auth?error=access_denied')).toBe(false);
    expect(readExpiredGoogleSignIn('https://eiyu-system.vercel.app/auth?error=server_error&error_code=unexpected_failure')).toBe(false);
  });

  it('is false for a plain URL, empty and non-string input', () => {
    expect(readExpiredGoogleSignIn('https://eiyu-system.vercel.app/auth')).toBe(false);
    expect(readExpiredGoogleSignIn('')).toBe(false);
    expect(readExpiredGoogleSignIn(undefined as unknown as string)).toBe(false);
  });
});

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

  it('recognises an expired sign-in by its code, as GoTrue sent it on 2026-11-07', () => {
    expect(classifyGoogleSignInError(EXPIRED)).toBe('expired');
    expect(classifyGoogleSignInError({error_code: 'bad_oauth_state'})).toBe('expired');
  });

  it('recognises an expired sign-in by its description alone, ignoring case', () => {
    expect(classifyGoogleSignInError({error: 'invalid_request', error_description: 'oauth state has expired'})).toBe('expired');
  });

  it('does not call other invalid_request errors expired', () => {
    expect(classifyGoogleSignInError({error: 'invalid_request', error_code: 'bad_oauth_callback'})).toBe('generic');
    expect(classifyGoogleSignInError({error: 'access_denied', error_code: 'otp_expired', error_description: 'Email link is invalid or has expired'}))
      .not.toBe('expired');
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

  it('tells an expired sign-in to try again, without the raw text', () => {
    expect(GOOGLE_EXPIRED_MESSAGE).toBe('Google sign-in took too long. Try again.');
    expect(googleSignInErrorMessage(EXPIRED)).toBe(GOOGLE_EXPIRED_MESSAGE);
    expect(googleSignInErrorMessage('expired')).toBe(GOOGLE_EXPIRED_MESSAGE);
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

  describe('with the birthday status', () => {
    const noBirthday = {birthDate: null, pendingBirthDate: null};
    const withBirthday = {birthDate: '2000-01-01', pendingBirthDate: null};

    it('is true for a half-finished account: permission saved, no birthday', () => {
      expect(needsGoogleSignupFinish(google, {ageConsent: true}, noBirthday)).toBe(true);
    });

    it('is false once permission and birthday are both saved', () => {
      expect(needsGoogleSignupFinish(google, {ageConsent: true}, withBirthday)).toBe(false);
    });

    it('treats a pending birthday as a saved one', () => {
      expect(needsGoogleSignupFinish(google, {ageConsent: true}, {birthDate: null, pendingBirthDate: '2000-01-01'})).toBe(false);
    });

    it('is still true without permission even when a birthday exists', () => {
      expect(needsGoogleSignupFinish(google, {ageConsent: false}, withBirthday)).toBe(true);
    });

    it('never pushes a password account in, even with no birthday', () => {
      expect(needsGoogleSignupFinish(password, {ageConsent: true}, noBirthday)).toBe(false);
      expect(needsGoogleSignupFinish(password, {ageConsent: false}, noBirthday)).toBe(false);
    });

    it('ignores a malformed birthday status rather than throwing', () => {
      expect(needsGoogleSignupFinish(google, {ageConsent: true}, {} as never)).toBe(false);
      expect(needsGoogleSignupFinish(google, {ageConsent: true}, {birthDate: 5} as never)).toBe(false);
    });
  });
});
