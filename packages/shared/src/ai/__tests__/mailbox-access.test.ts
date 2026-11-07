const rpc=jest.fn();const invoke=jest.fn();const from=jest.fn();
jest.mock('../../supabase/client',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'owner'},access_token:'inert-owner'}},error:null})},rpc:(...args:unknown[])=>rpc(...args),from:(...args:unknown[])=>from(...args),functions:{invoke:(...args:unknown[])=>invoke(...args)}}}));
import { generateWeeklySummary } from '../suggestions';
import { fetchOrCreateWeeklySummary,regenerateWeeklySummary } from '../../data/weekly-summary';
const state={userId:'owner',version:1,verified:true};
let currentMailbox=state;
beforeEach(()=>{currentMailbox=state;rpc.mockReset().mockImplementation((name:string)=>Promise.resolve({data:name==='get_processing_access'
 ? {contractVersion:1,userId:'owner',ageVersion:1,consentVersion:2,authorityVersion:0,mailboxVersion:1,
    ageEligible:true,ageConsent:true,aiConsent:true,canReadDebrief:true,canGenerateDebrief:true,authorityState:'not-required'}
 : currentMailbox,error:null}));invoke.mockReset().mockResolvedValue({data:{summary:'private'},error:null});from.mockReset();});
it('unproved mailbox denies every shared debrief entry point before reads/spending',async()=>{
 currentMailbox={...state,verified:false};
 await expect(generateWeeklySummary('2026-10-05')).rejects.toThrow('Verify your email');
 await expect(fetchOrCreateWeeklySummary('owner','UTC')).rejects.toThrow('Verify your email');
 await expect(regenerateWeeklySummary('owner','UTC')).rejects.toThrow('Verify your email');
 expect(invoke).not.toHaveBeenCalled();expect(from).not.toHaveBeenCalled();expect(rpc.mock.calls.every(([name])=>name==='get_mailbox_status')).toBe(true);
});
it('email change during generation discards output',async()=>{
 invoke.mockImplementationOnce(async()=>{currentMailbox={...state,version:3};return {data:{summary:'discarded'},error:null};});
 await expect(generateWeeklySummary('2026-10-05')).rejects.toThrow('Verify your email');
 expect(invoke).toHaveBeenCalledTimes(1);
});
it('a cached server debrief is discarded if the email revision changes while reading',async()=>{
 const builder={select:()=>builder,eq:()=>builder,setHeader:()=>builder,maybeSingle:async()=>{currentMailbox={...state,version:3};return {data:{summary:'Old private debrief'},error:null};}};from.mockReturnValue(builder);
 await expect(fetchOrCreateWeeklySummary('owner','UTC')).rejects.toThrow('Verify your email');expect(invoke).not.toHaveBeenCalled();
});
