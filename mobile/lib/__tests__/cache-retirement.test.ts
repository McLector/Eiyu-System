jest.mock('@supabase/supabase-js',()=>({createClient:jest.fn(()=>({auth:{}}))}));
jest.mock('react-native-url-polyfill/auto',()=>({}));

const root='eiyu:ai-suggestions';
const scoped=`${root}:abcdefab-1234-4123-8123-abcdefabcdef:1`;
const ordinary=['sb-synthetic-auth-token','REACT_QUERY_OFFLINE_CACHE','eiyu.widget.v1','eiyu.writeQueue.v1.synthetic'];
async function setup(failure=false){
 jest.resetModules();process.env.EXPO_PUBLIC_SUPABASE_URL='http://127.0.0.1:57321';process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY='synthetic-unit-only';
 const {default:storage}=jest.requireMock<typeof import('@react-native-async-storage/async-storage')>('@react-native-async-storage/async-storage');
 for(const key of [root,scoped,...ordinary])await storage.setItem(key,'synthetic-sentinel');
 if(failure)(storage.getAllKeys as jest.Mock).mockRejectedValueOnce(new Error('synthetic failure'));
 jest.requireActual('../supabase');
 return {storage,shared:jest.requireActual<typeof import('@eiyu/shared')>('@eiyu/shared'),createClient:jest.requireMock<typeof import('@supabase/supabase-js')>('@supabase/supabase-js').createClient};
}
test('real mobile adapter retires only known AI keys and preserves normal storage/Auth startup',async()=>{
 const {storage,shared,createClient}=await setup();
 expect(await shared.retrySuggestionCacheRetirement()).toBe('complete');
 expect(await storage.getAllKeys()).toEqual(ordinary);
 for(const key of ordinary)expect(await storage.getItem(key)).toBe('synthetic-sentinel');
 expect(createClient).toHaveBeenCalledTimes(1);
});
test('mobile enumeration failure leaves ordinary storage and Auth available; retry is explicit',async()=>{
 const {storage,shared,createClient}=await setup(true);
 expect(await shared.retrySuggestionCacheRetirement()).toBe('failed');
 expect(await storage.getItem(ordinary[0])).toBe('synthetic-sentinel');expect(createClient).toHaveBeenCalledTimes(1);
 expect(await shared.retrySuggestionCacheRetirement()).toBe('complete');
});
test('static rendering never enumerates actual device storage or reports successful device retirement',async()=>{
 const saved=Object.getOwnPropertyDescriptor(global,'window');
 Object.defineProperty(global,'window',{value:undefined,configurable:true});
 try{
  const {storage,shared}=await setup();
  expect(await shared.retrySuggestionCacheRetirement()).toBe('failed');
  expect(storage.getAllKeys).not.toHaveBeenCalled();expect(storage.removeItem).not.toHaveBeenCalled();
 }finally{if(saved)Object.defineProperty(global,'window',saved);}
});
