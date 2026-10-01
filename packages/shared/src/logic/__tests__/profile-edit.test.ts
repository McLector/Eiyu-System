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

  it('preserves an unchanged legacy 81+ code-point field while editing the other field', () => {
    const original = { displayName: '🧭'.repeat(81), userClass: 'Old class' };
    expect(normalizeProfileEdit({ displayName: original.displayName, userClass: '  Ranger  ' }, original))
      .toEqual({ displayName: original.displayName, userClass: 'Ranger' });
    expect(() => normalizeProfileEdit({ displayName: `${original.displayName}!`, userClass: 'Ranger' }, original))
      .toThrow(/80 characters/);
  });

  it('rejects invisible-only edited profile values but preserves internal joiners', () => {
    for (const invisible of ['\u200b', '\u200c', '\u200d', '\u2060', '\ufeff']) {
      expect(validateProfileText(invisible, 'Display name')).toMatch(/display name/i);
    }
    expect(normalizeProfileEdit({ displayName: '  👨‍👩‍👧‍👦  ', userClass: '  ک\u200cتاب  ' })).toEqual({
      displayName: '👨‍👩‍👧‍👦', userClass: 'ک\u200cتاب',
    });
  });

  it('preserves an unchanged 81-code-point legacy name but rejects a new over-limit value', () => {
    const long = '😀'.repeat(81);
    expect(normalizeProfileEdit({ displayName: long, userClass: 'Ranger' }, { displayName: long, userClass: 'Old' }).displayName).toBe(long);
    expect(() => normalizeProfileEdit({ displayName: long, userClass: 'Ranger' })).toThrow(/80 characters/);
  });
});
