import { authErrorMessage, confirmEmailMessage, resetLinkSentMessage } from '../auth-copy';

describe('resetLinkSentMessage', () => {
  it('names the given email and uses the Hunter-voice phrasing', () => {
    expect(resetLinkSentMessage('hunter@example.com')).toBe(
      'A reset link is on its way to you, Hunter — check hunter@example.com.'
    );
  });
});

describe('confirmEmailMessage', () => {
  it('names the given email and uses the Hunter-voice phrasing', () => {
    expect(confirmEmailMessage('hunter@example.com')).toBe(
      'A confirmation link is waiting at hunter@example.com — confirm it, then step into the System.'
    );
  });
});

describe('authErrorMessage', () => {
  it('prefixes a login-mode error with the login-specific Hunter-voice line', () => {
    expect(authErrorMessage('login', new Error('Invalid login credentials'))).toBe(
      'The System refuses entry — Invalid login credentials'
    );
  });

  it('prefixes a signup-mode error with the signup-specific Hunter-voice line', () => {
    expect(authErrorMessage('signup', new Error('User already registered'))).toBe(
      "The System couldn't complete your enrollment — User already registered"
    );
  });

  it('prefixes a forgot-mode error with the forgot-specific Hunter-voice line', () => {
    expect(authErrorMessage('forgot', new Error('Email rate limit exceeded'))).toBe(
      "The System couldn't send the link — Email rate limit exceeded"
    );
  });

  it('formats a non-Error thrown value the same way formatError would', () => {
    expect(authErrorMessage('login', { message: 'boom' })).toBe('The System refuses entry — boom');
  });
});
