import { supabase } from '../../supabase/client';
import { fetchAccountPalette, fetchAccountTheme, saveAccountPalette, saveAccountTheme, updateProfile } from '../profile';

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

describe('account palette', () => {
  const chain = (result: { data: unknown; error: unknown }) => {
    const maybeSingle = jest.fn().mockResolvedValue(result);
    const eq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ eq }));
    (supabase as unknown as { from: jest.Mock }).from = jest.fn(() => ({ select }));
    return { select, eq, maybeSingle };
  };

  it('reads the palette of the signed-in account', async () => {
    const { select, eq } = chain({ data: { palette: 'jade' }, error: null });
    await expect(fetchAccountPalette('user-1')).resolves.toBe('jade');
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith('palette');
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it.each([[{ palette: null }], [null]])('is null when the account has none yet (%j)', async data => {
    chain({ data, error: null });
    await expect(fetchAccountPalette('user-1')).resolves.toBeNull();
  });

  it('is null, never a throw, when the column is not deployed yet', async () => {
    chain({ data: null, error: { code: '42703', message: 'column profiles.palette does not exist' } });
    await expect(fetchAccountPalette('user-1')).resolves.toBeNull();
  });

  it('is null when the request itself fails', async () => {
    const maybeSingle = jest.fn().mockRejectedValue(new Error('network down'));
    (supabase as unknown as { from: jest.Mock }).from = jest.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
    await expect(fetchAccountPalette('user-1')).resolves.toBeNull();
  });

  it('saves the palette through the owner-scoped RPC', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'violet', error: null });
    await expect(saveAccountPalette('violet')).resolves.toBe('violet');
    expect(supabase.rpc).toHaveBeenCalledWith('set_profile_palette', { p_palette: 'violet' });
  });

  it('surfaces a failed save so the caller can decide', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('denied') });
    await expect(saveAccountPalette('violet')).rejects.toThrow('denied');
  });
});

describe('account theme', () => {
  const chain = (result: { data: unknown; error: unknown }) => {
    const maybeSingle = jest.fn().mockResolvedValue(result);
    const eq = jest.fn(() => ({ maybeSingle }));
    const select = jest.fn(() => ({ eq }));
    (supabase as unknown as { from: jest.Mock }).from = jest.fn(() => ({ select }));
    return { select, eq, maybeSingle };
  };

  it('reads the theme of the signed-in account', async () => {
    const { select, eq } = chain({ data: { theme: 'light' }, error: null });
    await expect(fetchAccountTheme('user-1')).resolves.toBe('light');
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(select).toHaveBeenCalledWith('theme');
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it.each(['LIGHT', '', 'blue', null])('is null for the stored value %j', async value => {
    chain({ data: { theme: value }, error: null });
    await expect(fetchAccountTheme('user-1')).resolves.toBeNull();
  });

  it('is null when there is no row or the read errors', async () => {
    chain({ data: null, error: null });
    await expect(fetchAccountTheme('user-1')).resolves.toBeNull();
    chain({ data: null, error: new Error('denied') });
    await expect(fetchAccountTheme('user-1')).resolves.toBeNull();
  });

  it('is null, never a throw, when the request itself fails', async () => {
    const maybeSingle = jest.fn().mockRejectedValue(new Error('network down'));
    (supabase as unknown as { from: jest.Mock }).from = jest.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
    await expect(fetchAccountTheme('user-1')).resolves.toBeNull();
  });

  it('saves the theme through the owner-scoped RPC', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'light', error: null });
    await expect(saveAccountTheme('light')).resolves.toBe('light');
    expect(supabase.rpc).toHaveBeenCalledWith('set_profile_theme', { p_theme: 'light' });
  });

  it('surfaces a failed save (for example the migration is not applied yet)', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: new Error('function not found') });
    await expect(saveAccountTheme('dark')).rejects.toThrow('function not found');
  });

  it('throws when the server answers with something that is not a theme', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: 'purple', error: null });
    await expect(saveAccountTheme('dark')).rejects.toThrow();
  });
});
