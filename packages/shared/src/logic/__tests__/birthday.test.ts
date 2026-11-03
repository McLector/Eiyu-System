import { validateBirthday } from '../validation';

describe('birthday declaration', () => {
  const today = '2026-10-11';
  it.each(['', '10/11/2000', '2000-2-03', '2023-02-29', '2000-04-31', '2026-10-12', '0000-01-01'])('rejects missing, malformed, impossible or future date %s', value => {
    expect(validateBirthday(value, today)).not.toBeNull();
  });
  it.each(['2000-02-29', '2026-10-11', '2014-10-11'])('accepts a real civil date %s without pretending it proves age', value => {
    expect(validateBirthday(value, today)).toBeNull();
  });
});
