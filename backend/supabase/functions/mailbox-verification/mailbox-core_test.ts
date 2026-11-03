import { createMailboxHandler, type MailboxDependencies } from './mailbox-core.ts';
function fixture(overrides: Partial<MailboxDependencies> = {}) {
 const calls: Array<{name:string;args:Record<string,unknown>}> = [];
 const authCalls: unknown[] = [];
 const deps: MailboxDependencies = {
  authenticate: async () => ({ id:'owner' }),
  createServiceClient: () => ({rpc:async (name,args) => {
   calls.push({name,args});
   return {data:name==='mailbox_begin'?{allowed:true,challengeId:'d2800000-0000-4000-8000-000000000101',email:'current@example.invalid',version:1,retryAfter:60}:
    name==='mailbox_attempt'?{allowed:true,email:'current@example.invalid',version:1}:true,error:null};
  }}),
  createOtpClient: () => ({auth:{
   signInWithOtp: async args => {authCalls.push(args); return {error:null};},
   verifyOtp: async args => {authCalls.push(args); return {data:{user:{id:'owner',email:'current@example.invalid'},session:{}},error:null};},
   signOut: async args => {authCalls.push(args); return {error:null};},
  }}),...overrides,
 };
 const handler=createMailboxHandler(deps);
 const run=(body:unknown,headers:Record<string,string>={Authorization:'Bearer test-only'})=>handler(new Request('http://local.test/mailbox',{method:'POST',headers,body:JSON.stringify(body)}));
 return {run,calls,authCalls,deps};
}
const id='d2800000-0000-4000-8000-000000000101';
Deno.test('mailbox send uses server identity/address and never creates an account',async()=>{
 const f=fixture();const r=await f.run({action:'send',email:'forged@example.invalid',userId:'forged'});
 const body=await r.json();
 if(r.status!==200||body.challengeId!==id||JSON.stringify(body).includes('current@example.invalid'))throw Error('safe challenge response required');
 if(f.calls[0].args.p_user_id!=='owner'||JSON.stringify(f.authCalls[0])!==JSON.stringify({email:'current@example.invalid',options:{shouldCreateUser:false}}))throw Error('must use current DB address');
});
Deno.test('mailbox proof is committed only after isolated OTP session cleanup',async()=>{
 const order:string[]=[];const f=fixture();
 const service=f.deps.createServiceClient(new AbortController().signal);
 f.deps.createServiceClient=()=>({rpc:async(name,args)=>{order.push(name);return service.rpc(name,args);}});
 const otp=f.deps.createOtpClient(new AbortController().signal);
 f.deps.createOtpClient=()=>({auth:{...otp.auth,signOut:async(args)=>{order.push('cleanup');return otp.auth.signOut(args);}}});
 const run=createMailboxHandler(f.deps);
 const r=await run(new Request('http://local.test/mailbox',{method:'POST',headers:{Authorization:'Bearer original-session'},body:JSON.stringify({action:'verify',challengeId:id,code:'12345678'})}));
 if(r.status!==200||order.join(',')!=='mailbox_attempt,cleanup,mailbox_finish')throw Error('commit only after cleanup');
 if(JSON.stringify(f.authCalls).includes('original-session'))throw Error('original session must not reach temporary OTP client');
});
Deno.test('mailbox malformed codes and oversized bodies never reach Auth or DB',async()=>{
 const f=fixture();for(const body of [{action:'verify',challengeId:id,code:'abc'},{action:'verify',challengeId:'bad',code:'123456'}, {action:'send',padding:'x'.repeat(5000)}]){
  if((await f.run(body)).status!==400)throw Error('invalid request accepted');
 }
 if(f.calls.length||f.authCalls.length)throw Error('validation must precede external operations');
});
Deno.test('mailbox authentication failure performs no service operation',async()=>{
 const f=fixture({authenticate:async()=>null});if((await f.run({action:'send'})).status!==401||f.calls.length)throw Error('auth required');
});
Deno.test('mailbox cooldown and expiry fail without sending or verifying',async()=>{
 const f=fixture({createServiceClient:()=>({rpc:async()=>({data:{allowed:false,retryAfter:60},error:null})})});
 if((await f.run({action:'send'})).status!==429||(await f.run({action:'verify',challengeId:id,code:'123456'})).status!==400||f.authCalls.length)throw Error('challenge denial bypassed');
});
Deno.test('mailbox delivery failure invalidates challenge and returns a generic error',async()=>{
 const f=fixture(); const otp=f.deps.createOtpClient(new AbortController().signal);
 f.deps.createOtpClient=()=>({auth:{...otp.auth,signInWithOtp:async()=>({error:Error('private recipient detail')})}});
 const r=await createMailboxHandler(f.deps)(new Request('http://local.test/mailbox',{method:'POST',headers:{Authorization:'Bearer test'},body:'{"action":"send"}'}));
 if(r.status!==503||(await r.text()).includes('private recipient')||f.calls.at(-1)?.args.p_delivered!==false)throw Error('generic delivery failure and invalidation required');
});
for(const problem of ['wrong-user','wrong-email','cleanup','persistence','otp'])Deno.test(`mailbox ${problem} never grants proof`,async()=>{
 const f=fixture();const otp=f.deps.createOtpClient(new AbortController().signal);let finish=false;
 f.deps.createOtpClient=()=>({auth:{...otp.auth,
  verifyOtp:async()=>({data:{user:{id:problem==='wrong-user'?'other':'owner',email:problem==='wrong-email'?'other@example.invalid':'current@example.invalid'},session:{}},error:problem==='otp'?Error('wrong code'):null}),
  signOut:async()=>({error:problem==='cleanup'?Error('cleanup unavailable'):null}),
 }});
 const service=f.deps.createServiceClient(new AbortController().signal);
 f.deps.createServiceClient=()=>({rpc:async(name,args)=>{if(name==='mailbox_finish'){finish=true;return {data:false,error:null};}return service.rpc(name,args);}});
 const r=await createMailboxHandler(f.deps)(new Request('http://local.test/mailbox',{method:'POST',headers:{Authorization:'Bearer test'},body:JSON.stringify({action:'verify',challengeId:id,code:'123456'})}));
 if(r.status===200||(problem!=='persistence'&&finish))throw Error('invalid evidence cannot grant proof');
});
