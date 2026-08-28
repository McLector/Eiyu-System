describe('supabase client singleton', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('throws a clear error when used before initSupabaseClient() is called', () => {
    const { supabase } = require('../client');

    expect(() => supabase.from('habits')).toThrow(
      'initSupabaseClient() must be called before use.'
    );
  });

  it('forwards calls to the real client after initSupabaseClient() is called', () => {
    const { supabase, initSupabaseClient } = require('../client');
    const fakeClient = { from: jest.fn().mockReturnValue('rows') };

    initSupabaseClient(fakeClient as never);

    expect(supabase.from('habits')).toBe('rows');
    expect(fakeClient.from).toHaveBeenCalledWith('habits');
  });
});
