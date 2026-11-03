import {initialBirthdayMetadata} from '../processing-consent';

describe('initial birthday purpose', () => {
  it.each([false, undefined, null, 'true', 1])('rejects missing or coerced consent before creating signup metadata: %s', granted => {
    expect(() => initialBirthdayMetadata('2000-01-01', granted as boolean, '2026-10-20')).toThrow(/permission|agree|notice/i);
  });
  it.each(['', '0000-01-01', '2023-02-29', '2026-10-21', '2014-10-21', '2020-01-01'])(
    'does not create new signup metadata for invalid or under12 birthday %s', birthday => {
      expect(() => initialBirthdayMetadata(birthday, true, '2026-10-20')).toThrow();
    });
  it('produces only the explicitly granted age purpose at the inclusive12 boundary', () => {
    expect(initialBirthdayMetadata('2014-10-20', true, '2026-10-20')).toEqual({
      birth_date: '2014-10-20', processing_consent: {age_screening: {granted: true, notice_version: '2026-10-20-age-v1'}},
    });
  });
  it('does not reject an adult or add AI, authority or new verification information', () => {
    expect(initialBirthdayMetadata('2000-01-01', true, '2026-10-20')).toEqual({
      birth_date: '2000-01-01', processing_consent: {age_screening: {granted: true, notice_version: '2026-10-20-age-v1'}},
    });
  });
  it('does not admit a leap birthday before its civil12-year boundary', () => {
    expect(() => initialBirthdayMetadata('2088-02-29', true, '2100-02-28')).toThrow(/12/);
    expect(initialBirthdayMetadata('2088-02-29', true, '2100-03-01').birth_date).toBe('2088-02-29');
  });
});
