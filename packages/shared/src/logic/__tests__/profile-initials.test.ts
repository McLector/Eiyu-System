import { profileInitials } from '../profile-initials';

describe('profileInitials', () => {
  it('keeps astral code points intact across name parts', () => {
    expect(profileInitials('🧭 Explorer')).toBe('🧭E');
    expect(profileInitials(' A\t🧭 B C ')).toBe('A🧭B');
  });
});
