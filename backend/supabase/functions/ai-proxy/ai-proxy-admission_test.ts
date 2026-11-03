import { parseExecutionTicket, executionDenial } from './ai-proxy-admission.ts';
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const expected={requestId:'d3500000-0000-4000-8000-000000000001',executionId:'d3500000-0000-4000-8000-000000000002'};
const admission={...expected,allowed:true,attemptNumber:1,epoch:4,contractVersion:1};
Deno.test('execution ticket binds exact identities, contract and safe epoch',()=>{
 const ticket=parseExecutionTicket(admission,expected);
 assert(ticket?.epoch===4&&ticket.requestId===expected.requestId&&ticket.executionId===expected.executionId,'valid admission ticket');
});
Deno.test('execution ticket rejects stale, malformed and legacy admission responses',()=>{
 for(const value of [null,[],true,{}, {...admission,allowed:false},{...admission,attemptNumber:2},
  {...admission,epoch:0},{...admission,epoch:-1},{...admission,epoch:1.5},{...admission,epoch:Number.MAX_SAFE_INTEGER+1},
  {...admission,epoch:'4'},{...admission,executionId:'other'},{...admission,requestId:'other'},
  {...admission,contractVersion:2},{...admission,contractVersion:undefined}]){
  assert(parseExecutionTicket(value,expected)===null,'invalid ticket must fail closed');
 }
});
Deno.test('execution denial classifies codes without reading or returning raw messages',()=>{
 for(const [code,kind] of [['EP001','processing'],['EP002','processing'],['EA001','age'],['EM001','mailbox'],['EQ001','quota'],['ED001','unavailable']]){
  assert(executionDenial({code,message:'untrusted diagnostic'})===kind,'domain code classification');
 }
 for(const value of [null,undefined,{},[],{message:'EP001'},{code:123}])assert(executionDenial(value)==='unavailable','unknown error fails closed');
});
