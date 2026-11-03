const mockInit=jest.fn(),mockFetch=jest.fn(async(..._args:unknown[])=>({status:200}));
jest.mock('@eiyu/shared',()=>({initSupabaseClient:jest.fn(),initCacheAdapter:jest.fn(),initOwnerExportTransport:(...args:unknown[])=>mockInit(...args)}));
jest.mock('@supabase/supabase-js',()=>({createClient:jest.fn(()=>({auth:{}}))}));
jest.mock('react-native-url-polyfill/auto',()=>({}));
jest.mock('expo/fetch',()=>({fetch:(...args:unknown[])=>mockFetch(...args)}));
it('initializes export from the same public configuration without loading or calling fetch eagerly',async()=>{
 process.env.EXPO_PUBLIC_SUPABASE_URL='http://127.0.0.1:57321';process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY='synthetic-unit-only';
 jest.requireActual('../supabase');expect(mockInit).toHaveBeenCalledTimes(1);expect(mockFetch).not.toHaveBeenCalled();
 const client=jest.requireMock('@supabase/supabase-js').createClient;
 const config=mockInit.mock.calls[0][0];expect(config.url).toBe(client.mock.calls[0][0]);expect(config.publishableKey).toBe(client.mock.calls[0][1]);
 await config.fetcher('http://127.0.0.1:57321/functions/v1/account-export',{method:'POST',credentials:'omit',redirect:'error'});
 expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:57321/functions/v1/account-export',expect.objectContaining({credentials:'omit',redirect:'error'}));
});
