import {authenticateExportBearer} from './export-auth.ts';
const uid='e5200000-0000-4000-8000-000000000001',sid='e5200000-0000-4000-8000-000000000011';
function token(claims:unknown){return btoa('{"alg":"synthetic-test-only"}')+'.'+btoa(JSON.stringify(claims))+'.synthetic-test-only';}
function expect(value:unknown,message:string):asserts value{if(!value)throw Error(message);}
Deno.test('export Auth verifies the exact bearer before using its session claim',async()=>{
 const jwt=token({sub:uid,session_id:sid,user_metadata:{role:'service_role'}});let verified='';
 const user=await authenticateExportBearer('Bearer '+jwt,async value=>{verified=value;return {id:uid};},new AbortController().signal);
 expect(verified===jwt&&user?.userId===uid&&user.sessionId===sid,'verified account and session required');
});
Deno.test('export Auth rejects unverified or mismatched session claims',async()=>{
 const signal=new AbortController().signal;
 expect(await authenticateExportBearer('Bearer '+token({sub:uid,session_id:sid}),async()=>null,signal)===null,'unverified JWT denied');
 for(const claims of [{sub:'foreign',session_id:sid},{sub:uid},{sub:uid,session_id:'bad'},null]){
  expect(await authenticateExportBearer('Bearer '+token(claims),async()=>({id:uid}),signal)===null,'bad claims denied');
 }
});
Deno.test('export Auth malformed input and raw verification errors never escape',async()=>{
 for(const input of ['','Bearer ','Basic value','Bearer not.a.valid-payload','Bearer '+token({sub:uid,session_id:sid})]){
  expect(await authenticateExportBearer(input,async()=>{throw Error('PRIVATE_SYNTHETIC_AUTH_ERROR');},new AbortController().signal)===null,'safe rejection');
 }
});
