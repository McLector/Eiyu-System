import {
  normalizeProfileEdit,
  PROFILE_TEXT_MAX_LENGTH,
  validateProfileText,
} from '../validation';

describe('profile editing validation', () => {
  it('trims both fields and preserves inert Unicode content', () => {
    expect(normalizeProfileEdit({ displayName: '  Yuki 🧭  ', userClass: '  夜明け  ' })).toEqual({
      displayName: 'Yuki 🧭',
      userClass: '夜明け',
    });
  });

  it('rejects blank values and counts code points at the 80-character boundary', () => {
    expect(validateProfileText('   ', 'Display name')).toMatch(/display name/i);
    expect(validateProfileText('😀'.repeat(PROFILE_TEXT_MAX_LENGTH), 'Display name')).toBeNull();
    expect(validateProfileText('😀'.repeat(PROFILE_TEXT_MAX_LENGTH + 1), 'Display name')).toMatch(/80/);
  });
});
