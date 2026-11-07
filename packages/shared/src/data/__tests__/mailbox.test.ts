const rpc=jest.fn();const invoke=jest.fn();
jest.mock('../../supabase/client',()=>({supabase:{rpc:(...args:unknown[])=>rpc(...args),functions:{invoke:(...args:unknown[])=>invoke(...args)}}}));
import { fetchMailboxStatus, requireMailboxProof, sendMailboxCode, verifyMailboxCode } from '../mailbox';
const state={userId:'owner',version:1,verified:true};
beforeEach(()=>{rpc.mockReset().mockResolvedValue({data:state,error:null});invoke.mockReset();});
const CID='d2800000-0000-4000-8000-000000000101';
const pending={id:CID,expiresAt:'2026-11-08T12:10:00.000Z',resendAfter:42};
it('reads self-scoped server state without metadata',async()=>{expect(await fetchMailboxStatus()).toEqual({...state,challenge:null});expect(rpc).toHaveBeenCalledWith('get_mailbox_status');});
describe('pending challenge',()=>{
 it('parses a valid challenge',async()=>{rpc.mockResolvedValue({data:{...state,verified:false,challenge:pending},error:null});
  expect(await fetchMailboxStatus()).toEqual({...state,verified:false,challenge:pending});});
 it('accepts a Postgres-style timestamp and the 0 and 600 limits',async()=>{
  for(const resendAfter of [0,600]){const c={id:CID.toUpperCase(),expiresAt:'2026-11-08T12:10:00.123456+00:00',resendAfter};
   rpc.mockResolvedValue({data:{...state,challenge:c},error:null});expect((await fetchMailboxStatus()).challenge).toEqual(c);}});
 it('treats a response with no challenge key (an older server) as no challenge',async()=>{rpc.mockResolvedValue({data:state,error:null});
  expect((await fetchMailboxStatus()).challenge).toBeNull();});
 it('keeps an explicit null',async()=>{rpc.mockResolvedValue({data:{...state,challenge:null},error:null});expect((await fetchMailboxStatus()).challenge).toBeNull();});
 it.each([
  ['a malformed id',{...pending,id:'not-a-uuid'}],
  ['an id that is not text',{...pending,id:7}],
  ['a missing id',{expiresAt:pending.expiresAt,resendAfter:42}],
  ['garbage instead of a date',{...pending,expiresAt:'soon'}],
  ['a date that is not text',{...pending,expiresAt:1762603800000}],
  ['a negative resendAfter',{...pending,resendAfter:-1}],
  ['a resendAfter above 600',{...pending,resendAfter:601}],
  ['a fractional resendAfter',{...pending,resendAfter:1.5}],
  ['a resendAfter given as text',{...pending,resendAfter:'30'}],
  ['a missing resendAfter',{id:CID,expiresAt:pending.expiresAt}],
  ['an array',[pending]],
  ['a string',CID],
  ['a number',5],
 ])('drops %s to null but still returns the status',async(_name,challenge)=>{
  rpc.mockResolvedValue({data:{...state,verified:false,challenge},error:null});
  expect(await fetchMailboxStatus()).toEqual({...state,verified:false,challenge:null});});
 it('never passes extra challenge fields through',async()=>{
  rpc.mockResolvedValue({data:{...state,challenge:{...pending,code:'123456',email:'a@b.c'}},error:null});
  expect((await fetchMailboxStatus()).challenge).toEqual(pending);});
 it('still fails closed on a bad base status even with a good challenge',async()=>{
  rpc.mockResolvedValue({data:{...state,version:0,challenge:pending},error:null});await expect(fetchMailboxStatus()).rejects.toThrow('unavailable');});
 it('requireMailboxProof returns the challenge alongside the status',async()=>{rpc.mockResolvedValue({data:{...state,challenge:pending},error:null});
  expect((await requireMailboxProof(state)).challenge).toEqual(pending);});
});
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
 expect(await verifyMailboxCode('d2800000-0000-4000-8000-000000000101','12345678',state)).toEqual({...state,challenge:null});
 rpc.mockResolvedValue({data:{...state,version:2,verified:false},error:null});
 await expect(verifyMailboxCode('d2800000-0000-4000-8000-000000000101','12345678',state)).rejects.toThrow();
});
it('preserves a safe endpoint error message without logging response details',async()=>{
 invoke.mockResolvedValue({data:null,error:{context:new Response(JSON.stringify({error:'Please wait before requesting another code.'}),{status:429})}});
 await expect(sendMailboxCode()).rejects.toThrow('Please wait');
});
