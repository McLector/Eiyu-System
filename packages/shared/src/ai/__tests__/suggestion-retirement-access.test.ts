import {suggestStages} from '../suggestions';
import {initCacheAdapter, retrySuggestionCacheRetirement, type CacheAdapter} from '../../cache/adapter';
const mockSession=jest.fn();const mockRpc=jest.fn();const mockInvoke=jest.fn();
jest.mock('../../supabase/client',()=>({supabase:{auth:{getSession:(...args:unknown[])=>mockSession(...args)},rpc:(...args:unknown[])=>mockRpc(...args),functions:{invoke:(...args:unknown[])=>mockInvoke(...args)}}}));
const open={contractVersion:1,userId:'synthetic-owner',ageVersion:1,consentVersion:2,authorityVersion:0,mailboxVersion:1,ageEligible:true,ageConsent:true,aiConsent:true,
 canReadDebrief:true,canGenerateDebrief:true,authorityState:'not-required'};
const mailbox={userId:'synthetic-owner',version:1,verified:true};
beforeEach(()=>{jest.clearAllMocks();
 mockSession.mockResolvedValue({data:{session:{user:{id:'synthetic-owner'},access_token:'unit-only'}},error:null});
 mockRpc.mockImplementation(async(name:string)=>({data:name==='get_mailbox_status'?mailbox:open,error:null}));
 mockInvoke.mockResolvedValue({data:{stages:['Fresh from the server']},error:null});
});
// The suggestion cache was retired in S02 (it could outlive the account that made it). Stage suggestions came back in S03b
// without it, so the retirement state must never change what they do.
it.each(['complete','failed','pending'] as const)('uses no cache, whatever the retirement state (%s)',async state=>{
 const adapter:CacheAdapter={getAllKeys:jest.fn(()=>state==='failed'?Promise.reject(Error()):state==='pending'?new Promise(()=>{}):Promise.resolve([])),getItem:jest.fn(async()=>JSON.stringify({synthetic:'fresh'})),setItem:jest.fn(async()=>{}),removeItem:jest.fn(async()=>{})};
 initCacheAdapter(adapter);if(state!=='pending')await retrySuggestionCacheRetirement();
 await expect(suggestStages('Read a synthetic quest','INT')).resolves.toEqual(['Fresh from the server']);
 expect(adapter.getItem).not.toHaveBeenCalled();expect(adapter.setItem).not.toHaveBeenCalled();
 expect(mockInvoke).toHaveBeenCalledTimes(1);
});
it.each(['eiyu:ai-suggestions','eiyu:ai-suggestions:abcdefab-1234-4123-8123-abcdefabcdef:1'])('fresh old output cannot stand in for a real answer (%s)',async key=>{
 const store=new Map([[key,JSON.stringify({at:Date.now(),value:['Synthetic cached stage']})]]);
 const read=jest.fn(async(k:string)=>store.get(k)??null);initCacheAdapter({getItem:read,setItem:async()=>{},removeItem:async()=>{}});
 await expect(suggestStages('Read','INT')).resolves.toEqual(['Fresh from the server']);expect(read).not.toHaveBeenCalled();
 expect(mockInvoke).toHaveBeenCalledTimes(1);
});
it('does not call the AI at all while access is missing',async()=>{
 initCacheAdapter({getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{}});
 mockRpc.mockImplementation(async(name:string)=>({data:name==='get_mailbox_status'?mailbox
  :{...open,ageVersion:0,consentVersion:0,ageEligible:false,ageConsent:false,aiConsent:false,canReadDebrief:false,canGenerateDebrief:false,authorityState:'pending'},error:null}));
 await expect(suggestStages('Read','INT')).rejects.toThrow(/18\+ box/);expect(mockInvoke).not.toHaveBeenCalled();
});
