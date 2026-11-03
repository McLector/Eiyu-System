const rpc=jest.fn();const invoke=jest.fn();
jest.mock('../../supabase/client',()=>({supabase:{rpc:(...args:unknown[])=>rpc(...args),functions:{invoke:(...args:unknown[])=>invoke(...args)}}}));
import { fetchMailboxStatus, requireMailboxProof, sendMailboxCode, verifyMailboxCode } from '../mailbox';
const state={userId:'owner',version:1,verified:true};
beforeEach(()=>{rpc.mockReset().mockResolvedValue({data:state,error:null});invoke.mockReset();});
it('reads self-scoped server state without metadata',async()=>{expect(await fetchMailboxStatus()).toEqual(state);expect(rpc).toHaveBeenCalledWith('get_mailbox_status');});
it.each([null,{}, {...state,verified:'true'},{...state,version:0}])('fails closed on missing/malformed backend',async data=>{rpc.mockResolvedValue({data,error:null});await expect(requireMailboxProof()).rejects.toThrow();});
it('rejects lost proof, owner changes and email ABA revisions',async()=>{
 for(const data of [{...state,verified:false},{...state,userId:'other'},{...state,version:3}]){rpc.mockResolvedValue({data,error:null});await expect(requireMailboxProof(state)).rejects.toThrow('Verify your email');}
});
it('send carries no caller-selected recipient and validates the challenge response',async()=>{
 invoke.mockResolvedValue({data:{challengeId:'d2800000-0000-4000-8000-000000000101',retryAfter:60},error:null});
 expect((await sendMailboxCode()).retryAfter).toBe(60);expect(invoke).toHaveBeenCalledWith('mailbox-verification',{body:{action:'send'}});
 invoke.mockResolvedValue({data:{},error:null});await expect(sendMailboxCode()).rejects.toThrow();
});
it('rejects malformed input before invoke and requires fresh proof after success',async()=>{
 await expect(verifyMailboxCode('id','bad')).rejects.toThrow();expect(invoke).not.toHaveBeenCalled();
 invoke.mockResolvedValue({data:{verified:true},error:null});
 expect(await verifyMailboxCode('d2800000-0000-4000-8000-000000000101','12345678',state)).toEqual(state);
 rpc.mockResolvedValue({data:{...state,version:2,verified:false},error:null});
 await expect(verifyMailboxCode('d2800000-0000-4000-8000-000000000101','12345678',state)).rejects.toThrow();
});
it('preserves a safe endpoint error message without logging response details',async()=>{
 invoke.mockResolvedValue({data:null,error:{context:new Response(JSON.stringify({error:'Please wait before requesting another code.'}),{status:429})}});
 await expect(sendMailboxCode()).rejects.toThrow('Please wait');
});
