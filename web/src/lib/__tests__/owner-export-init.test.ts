// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({init:vi.fn(),client:vi.fn((...args:unknown[])=>({auth:{},args})),fetch:vi.fn(async()=>({status:200}))}));
vi.mock('@eiyu/shared',()=>({initSupabaseClient:vi.fn(),initOwnerExportTransport:api.init}));
vi.mock('@supabase/supabase-js',()=>({createClient:api.client}));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('initializes export from the same public configuration without an eager request',async()=>{
 vi.resetModules();vi.stubEnv('VITE_SUPABASE_URL','http://127.0.0.1:57321');vi.stubEnv('VITE_SUPABASE_ANON_KEY','synthetic-unit-only');vi.stubGlobal('fetch',api.fetch);
 await import('../supabase');expect(api.init).toHaveBeenCalledTimes(1);expect(api.fetch).not.toHaveBeenCalled();
 const config=api.init.mock.calls[0][0];expect(config.url).toBe(api.client.mock.calls[0][0]);expect(config.publishableKey).toBe(api.client.mock.calls[0][1]);
 await config.fetcher('http://127.0.0.1:57321/functions/v1/account-export',{method:'POST',credentials:'omit',redirect:'error'});
 expect(api.fetch).toHaveBeenCalledWith('http://127.0.0.1:57321/functions/v1/account-export',expect.objectContaining({cache:'no-store',credentials:'omit',redirect:'error'}));
});
