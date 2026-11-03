import { FunctionsHttpError } from '@supabase/supabase-js';

import { generateWeeklySummary } from '../suggestions';
import { supabase } from '../../supabase/client';
import { initCacheAdapter, type CacheAdapter } from '../../cache/adapter';

jest.mock('../../supabase/client', () => ({
  supabase: {
    auth: {getSession: async () => ({data:{session:{user:{id:'owner'},access_token:'inert-owner'}},error:null})},
    rpc: jest.fn(async (name:string) => ({data:name==='get_mailbox_status'
      ? {userId:'owner',version:1,verified:true}
      : {contractVersion:1,userId:'owner',ageVersion:1,mailboxVersion:1,consentVersion:1,authorityVersion:0,
        ageEligible:true,ageConsent:true,aiConsent:true,canReadDebrief:true,canGenerateDebrief:true,authorityState:'not-required'},error:null})),
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

const summary=()=>generateWeeklySummary('2026-10-19');
describe('invokeAiProxy error handling (via active weekly-summary entry point)', () => {
  beforeEach(() => {
    (supabase.functions.invoke as jest.Mock).mockClear();
    initCacheAdapter(inMemoryCacheAdapter());
  });

  it("surfaces ai-proxy's own JSON error message instead of the generic SDK one", async () => {
    const fakeResponse = { json: async () => ({ error: 'questName is required' }) };
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(fakeResponse),
    });

    await expect(summary()).rejects.toThrow('questName is required');
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

    await expect(summary()).rejects.toThrow(
      'Edge Function returned a non-2xx status code'
    );
  });

  it('passes through a non-HTTP error (e.g. network failure) unchanged', async () => {
    (supabase.functions.invoke as jest.Mock).mockResolvedValueOnce({
      data: null,
      error: new Error('Failed to fetch'),
    });

    await expect(summary()).rejects.toThrow('Failed to fetch');
  });
});
