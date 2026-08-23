import {
  MAX_DISPLAY_NAME_LENGTH,
  passwordStrength,
  validateConfirmPassword,
  validateDisplayName,
  validateEmail,
  validatePassword,
  validateRequired,
} from '../validation';

describe('validateDisplayName', () => {
  it('rejects empty and whitespace-only names', () => {
    expect(validateDisplayName('')).toBe('Enter a display name.');
    expect(validateDisplayName('   ')).toBe('Enter a display name.');
  });

  it('rejects single-character names', () => {
    expect(validateDisplayName('K')).toBe('Display name must be at least 2 characters.');
  });

  it('accepts normal names regardless of surrounding whitespace', () => {
    expect(validateDisplayName('  Kaito Mizuru  ')).toBeNull();
  });

  it('rejects names over the max length', () => {
    expect(validateDisplayName('a'.repeat(MAX_DISPLAY_NAME_LENGTH + 1))).toContain(
      `${MAX_DISPLAY_NAME_LENGTH} characters or fewer`
    );
    expect(validateDisplayName('a'.repeat(MAX_DISPLAY_NAME_LENGTH))).toBeNull();
  });
});

describe('validateEmail', () => {
  it.each(['', '   '])('rejects empty input %p', email => {
    expect(validateEmail(email)).toBe('Enter your email.');
  });

  it.each(['plainaddress', 'no-tld@domain', '@domain.com', 'user @x.com', 'user@dom ain.com'])(
    'rejects malformed email %p',
    email => {
      expect(validateEmail(email)).not.toBeNull();
    }
  );

  it.each(['you@example.com', 'user.name+tag@sub.domain.io'])('accepts %p', email => {
    expect(validateEmail(email)).toBeNull();
  });
});

describe('validatePassword', () => {
  it('rejects empty passwords', () => {
    expect(validatePassword('')).toBe('Enter a password.');
  });

  it('enforces the shared minimum length', () => {
    expect(validatePassword('abc12')).toContain('at least 6');
    expect(validatePassword('abc123')).toBeNull();
  });
});

describe('validateConfirmPassword', () => {
  it('requires a value', () => {
    expect(validateConfirmPassword('secret1', '')).toBe('Confirm your password.');
  });

  it('flags mismatches', () => {
    expect(validateConfirmPassword('secret1', 'secret2')).toBe('Passwords do not match.');
  });

  it('accepts matching passwords', () => {
    expect(validateConfirmPassword('secret1', 'secret1')).toBeNull();
  });
});

describe('validateRequired', () => {
  it('uses the provided label in the message', () => {
    expect(validateRequired('', 'Quest name')).toBe('Quest name is required.');
    expect(validateRequired(' x ', 'Quest name')).toBeNull();
  });
});

describe('passwordStrength', () => {
  it('scores empty as 0', () => {
    expect(passwordStrength('')).toBe(0);
  });

  it('scores short single-class passwords low', () => {
    expect(passwordStrength('abcdef')).toBe(1);
  });

  it('rewards length', () => {
    expect(passwordStrength('abcdefghij')).toBe(2);
  });

  it('caps at 3 for length plus mixed classes', () => {
    expect(passwordStrength('LongEnough123!')).toBe(3);
  });
});
