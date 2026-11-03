import {suggestStages} from '../suggestions';
import {initCacheAdapter, retrySuggestionCacheRetirement, type CacheAdapter} from '../../cache/adapter';
const mockSession=jest.fn();const mockRpc=jest.fn();const mockInvoke=jest.fn();
jest.mock('../../supabase/client',()=>({supabase:{auth:{getSession:(...args:unknown[])=>mockSession(...args)},rpc:(...args:unknown[])=>mockRpc(...args),functions:{invoke:(...args:unknown[])=>mockInvoke(...args)}}}));
const paused='Stage suggestions are unavailable while their privacy requirements are reviewed.';
beforeEach(()=>{jest.clearAllMocks();mockSession.mockResolvedValue({data:{session:{user:{id:'synthetic-owner'},access_token:'unit-only'}},error:null});mockRpc.mockResolvedValue({data:null,error:null});});
it.each(['complete','failed','pending'] as const)('refuses valid/invalid stage inputs without cache/Auth/model activity when retirement is %s',async state=>{
 const adapter:CacheAdapter={getAllKeys:jest.fn(()=>state==='failed'?Promise.reject(Error()):state==='pending'?new Promise(()=>{}):Promise.resolve([])),getItem:jest.fn(async()=>JSON.stringify({synthetic:'fresh'})),setItem:jest.fn(async()=>{}),removeItem:jest.fn(async()=>{})};
 initCacheAdapter(adapter);if(state!=='pending')await retrySuggestionCacheRetirement();
 for(const name of ['','Read a synthetic quest'])await expect(suggestStages(name,'INT')).rejects.toThrow(paused);
 expect(adapter.getItem).not.toHaveBeenCalled();expect(adapter.setItem).not.toHaveBeenCalled();expect(mockSession).not.toHaveBeenCalled();expect(mockRpc).not.toHaveBeenCalled();expect(mockInvoke).not.toHaveBeenCalled();
});
it.each(['eiyu:ai-suggestions','eiyu:ai-suggestions:abcdefab-1234-4123-8123-abcdefabcdef:1'])('fresh old output cannot bypass the deliberate pause (%s)',async key=>{
 const store=new Map([[key,JSON.stringify({at:Date.now(),value:['Synthetic cached stage']})]]);
 const read=jest.fn(async(k:string)=>store.get(k)??null);initCacheAdapter({getItem:read,setItem:async()=>{},removeItem:async()=>{}});
 await expect(suggestStages('Read','INT')).rejects.toThrow(paused);expect(read).not.toHaveBeenCalled();expect(mockSession).not.toHaveBeenCalled();expect(mockInvoke).not.toHaveBeenCalled();
});
