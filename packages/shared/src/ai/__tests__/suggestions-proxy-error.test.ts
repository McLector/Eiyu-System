import { FunctionsHttpError } from '@supabase/supabase-js';

import { suggestEasyVersions } from '../suggestions';
import { supabase } from '../../supabase/client';
import { initCacheAdapter, type CacheAdapter } from '../../cache/adapter';

jest.mock('../../supabase/client', () => ({
  supabase: {
    functions: {
      invoke: jest.fn(),
    },
  },
}));

function inMemoryCacheAdapter(): CacheAdapter {
  const store = new Map<string, string>();
  return {
    getItem: async key => store.get(key) ?? null,
    setItem: async (key, value) => {
      store.set(key, value);
    },
    removeItem: async key => {
      store.delete(key);
    },
  };
}

describe('invokeAiProxy error handling (via suggestEasyVersions)', () => {
  beforeEach(() => {
    (supabase.functions.invoke as jest.Mock).mockClear();
    initCacheAdapter(inMemoryCacheAdapter());
  });

  it("surfaces ai-proxy's own JSON error message instead of the generic SDK one", async () => {
    const fakeResponse = { json: async () => ({ error: 'habitName is required' }) };
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(fakeResponse),
    });

    await expect(suggestEasyVersions('', 'STR')).rejects.toThrow('habitName is required');
  });

  it('falls back to the generic SDK message when the error body is not parseable JSON', async () => {
    const fakeResponse = {
      json: async () => {
        throw new Error('not json');
      },
    };
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(fakeResponse),
    });

    await expect(suggestEasyVersions('Read', 'INT')).rejects.toThrow(
      'Edge Function returned a non-2xx status code'
    );
  });

  it('passes through a non-HTTP error (e.g. network failure) unchanged', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: new Error('Failed to fetch'),
    });

    await expect(suggestEasyVersions('Read', 'WIS')).rejects.toThrow('Failed to fetch');
  });
});
