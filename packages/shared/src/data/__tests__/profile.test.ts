import { supabase } from '../../supabase/client';
import { updateProfile } from '../profile';

jest.mock('../../supabase/client', () => ({
  supabase: { rpc: jest.fn() },
}));

describe('updateProfile', () => {
  beforeEach(() => (supabase.rpc as jest.Mock).mockReset());

  it('trims values and sends only the owner-scoped profile RPC payload', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { displayName: 'Yuki 🧭', userClass: 'Ranger', timeZone: 'UTC' },
      error: null,
    });

    await expect(updateProfile({ displayName: '  Yuki 🧭 ', userClass: ' Ranger ' })).resolves.toEqual({
      displayName: 'Yuki 🧭', userClass: 'Ranger', timeZone: 'UTC',
    });
    expect(supabase.rpc).toHaveBeenCalledWith('update_profile', {
      p_display_name: 'Yuki 🧭',
      p_user_class: 'Ranger',
    });
  });

  it('does not call the network for invalid input', async () => {
    await expect(updateProfile({ displayName: ' ', userClass: 'Ranger' })).rejects.toThrow(/display name/i);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('round-trips an unchanged grandfathered field while editing Class', async () => {
    const legacyName = '🧭'.repeat(81);
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: { displayName: legacyName, userClass: 'Ranger', timeZone: 'UTC' }, error: null,
    });
    await updateProfile({ displayName: legacyName, userClass: '  Ranger  ' },
      { displayName: legacyName, userClass: 'Old class' });
    expect(supabase.rpc).toHaveBeenCalledWith('update_profile', {
      p_display_name: legacyName, p_user_class: 'Ranger',
    });
  });
});
