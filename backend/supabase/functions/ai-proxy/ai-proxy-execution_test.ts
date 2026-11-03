import { createAiProxyHandler as realProxyHandler } from './ai-proxy-core.ts';
import type { AiProxyDependencies } from './ai-proxy-core.ts';
import { withCanonicalWeekInput } from './test-helpers/admission.ts';
const createAiProxyHandler = (dependencies: AiProxyDependencies) => realProxyHandler(withCanonicalWeekInput(dependencies));
function assert(value: unknown,message: string): asserts value {if(!value)throw Error(message);}
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};}
const weekly={action:'weekly-summary',processingAccess:{contractVersion:1,ageVersion:1,mailboxVersion:1,consentVersion:2,authorityVersion:0},weekStart:'2026-10-05'};
function admissionFixture(options:{closed?:boolean;missingMigration?:boolean;malformedTicket?:boolean;hold?:boolean;settleRefused?:boolean;settleMalformed?:boolean;authorizationCode?:string;providerReject?:boolean;retry?:boolean;duplicateFirst?:boolean;admissionAckLost?:boolean;authorizationAckLost?:boolean;totalRequestTimeoutMs?:number}={}){
 const entered=deferred<boolean>(),held=deferred<Record<string,unknown>>();
 const state={open:!options.closed,epoch:1,providerCalls:0,outstanding:0,refunds:0,legacyCalls:0,authorized:0,settlement:'',calls:[] as string[]};
 let executionId='',requestId='';
 const client={
  auth:{getUser:async()=>({data:{user:{id:'d3500000-0000-4000-8000-000000000001'}},error:null})},
  rpc:async(name:string,args:Record<string,unknown>):Promise<{data:unknown;error:unknown}>=>{
   state.calls.push(name);
   if(name==='ai_admit_execution'){
    if(options.missingMigration)return{data:null,error:{code:'PGRST202'}};
    if(!state.open)return{data:{allowed:false,attemptNumber:0,reason:'unavailable'},error:null};
    executionId=String(args.p_execution_id);requestId=String(args.p_request_id);state.outstanding++;
    if(options.admissionAckLost)return await new Promise(()=>{});
    return{data:{allowed:true,attemptNumber:1,contractVersion:1,executionId,requestId,epoch:options.malformedTicket?'1':1,
     ageVersion:1,mailboxVersion:1,consentVersion:2,authorityVersion:0},error:null};
   }
   if(name==='ai_authorize_execution_attempt'){
    if(options.authorizationCode)return{data:null,error:{code:options.authorizationCode}};
    if(!state.open||args.p_epoch!==state.epoch||args.p_execution_id!==executionId)return{data:false,error:null};
    if(options.retry&&args.p_attempt_number===2)return{data:null,error:{code:'EQ001'}};
    if(args.p_attempt_number!==state.authorized+1)return{data:false,error:null};
    state.authorized++;
    if(options.authorizationAckLost)return await new Promise(()=>{});
    return{data:true,error:null};
   }
   if(name==='ai_prepare_execution_result')return{data:state.open&&args.p_epoch===state.epoch&&state.authorized>0,error:null};
   if(name==='ai_settle_execution'){
    if(options.settleRefused)return{data:false,error:null};
    if(options.settleMalformed)return{data:'true',error:null};
    if(args.p_outcome==='stopped-before-dispatch'&&state.authorized>0)return{data:false,error:null};
    state.settlement=String(args.p_outcome);
    if(state.settlement!=='unresolved')state.outstanding--;
    return{data:true,error:null};
   }
   if(name==='ai_release_request'){state.refunds++;return{data:true,error:null};}
   state.legacyCalls++;return{data:null,error:{code:'legacy-protocol-forbidden'}};
  },
 };
 const handler=createAiProxyHandler({createUserClient:()=>client,createServiceClient:()=>client,totalRequestTimeoutMs:options.totalRequestTimeoutMs,
  generate:async(_action,_payload,reserve)=>{
   if(!await reserve(1))throw Error('synthetic first authorization denied');
   state.providerCalls++;entered.resolve(true);
   if(options.duplicateFirst){if(await reserve(1))state.providerCalls++;throw Error('duplicate dispatch refused');}
   if(options.retry){if(!await reserve(2))throw Error('synthetic retry quota denied');state.providerCalls++;}
   if(options.providerReject)throw Error('synthetic uncertain transport');
   return options.hold?await held.promise:{summary:'synthetic execution output'};
  }});
 return{state,handler,providerEntered:entered.promise,resolveProvider:held.resolve,
  closeGate(){state.open=false;state.epoch++;},
  validWeeklyRequest(signal?:AbortSignal){return new Request('https://local.test/ai',{method:'POST',headers:{Authorization:'synthetic-placeholder','Content-Type':'application/json'},body:JSON.stringify(weekly),signal});}};
}
Deno.test('strict core uses instrumented admission and authorizes first dispatch',async()=>{
 const run=admissionFixture();const response=await run.handler(run.validWeeklyRequest());
 assert(response.status===200,'instrumented request must succeed');
 assert(run.state.providerCalls===1&&run.state.authorized===1,'first provider call requires actual authorization');
 assert(run.state.legacyCalls===0,'no fallback to legacy RPCs');
 assert(run.state.outstanding===0&&run.state.settlement==='completed','local completion is distinct from refund');
 assert(run.state.refunds===0,'successful quota remains charged');
 assert(run.state.calls.indexOf('ai_settle_execution')<run.state.calls.indexOf('ai_prepare_execution_result'),'settlement precedes last output check');
});
for(const options of [{closed:true},{missingMigration:true},{malformedTicket:true}])Deno.test(`execution admission fails closed ${Object.keys(options)[0]}`,async()=>{
 const run=admissionFixture(options);const response=await run.handler(run.validWeeklyRequest());
 assert(response.status===503&&run.state.providerCalls===0,'unavailable admission cannot dispatch');
 assert(run.state.legacyCalls===0,'unavailable migration cannot trigger legacy fallback');
 if(options.malformedTicket)assert(run.state.outstanding===1,'untrusted ticket does not erase committed unknown work');
});
Deno.test('close during an admitted held provider request refuses stale output',async()=>{
 const run=admissionFixture({hold:true});const response=run.handler(run.validWeeklyRequest());
 const reached=await Promise.race([run.providerEntered,response.then(()=>false)]);
 assert(reached,'held provider must actually enter');
 run.closeGate();run.resolveProvider({summary:'synthetic held output'});
 const result=await response;
 assert(result.status===503&&!(await result.text()).includes('synthetic held output'),'closed epoch cannot release stale result');
 assert(run.state.providerCalls===1,'only already admitted operation ran');
 assert(run.state.settlement==='completed','returned provider promise is locally settled, not retroactively canceled');
});
for(const options of [{settleRefused:true},{settleMalformed:true}])Deno.test(`settlement acknowledgment fails closed ${Object.keys(options)[0]}`,async()=>{
 const run=admissionFixture(options);const response=await run.handler(run.validWeeklyRequest());
 assert(response.status===503&&!(await response.text()).includes('synthetic execution output'),'unknown settlement must not release success');
 assert(run.state.providerCalls===1&&run.state.outstanding===1,'failed acknowledgment preserves uncertain accounting');
});
Deno.test('ambiguous dispatched failure remains unresolved after refund',async()=>{
 const run=admissionFixture({providerReject:true});const response=await run.handler(run.validWeeklyRequest());
 assert(response.status===503&&run.state.providerCalls===1,'actual synthetic dispatch rejected');
 assert(run.state.settlement==='unresolved'&&run.state.outstanding===1,'refund cannot complete uncertain work');
 assert(run.state.refunds===1,'user refund remains separate');
});
Deno.test('processing refusal before first dispatch settles as stopped-before-dispatch',async()=>{
 const run=admissionFixture({authorizationCode:'EP001'});const response=await run.handler(run.validWeeklyRequest());
 assert(response.status===403&&run.state.providerCalls===0,'processing denial precedes provider');
 assert(run.state.settlement==='stopped-before-dispatch'&&run.state.outstanding===0,'known no-dispatch request can settle');
});
Deno.test('actual retry quota preserves429 while maintenance refusal is503',async()=>{
 const run=admissionFixture({retry:true});const response=await run.handler(run.validWeeklyRequest());
 assert(response.status===429&&run.state.providerCalls===1,'retry quota cannot create another provider call');
});
Deno.test('duplicate first authorization never dispatches twice',async()=>{
 const run=admissionFixture({duplicateFirst:true});const response=await run.handler(run.validWeeklyRequest());
 assert(response.status===503&&run.state.providerCalls===1,'cached reservation is not a second dispatch permit');
});
Deno.test('caller cancellation while provider remains pending preserves uncertainty',async()=>{
 const run=admissionFixture({hold:true}),controller=new AbortController();
 const response=run.handler(run.validWeeklyRequest(controller.signal));
 assert(await Promise.race([run.providerEntered,response.then(()=>false)]),'provider must enter before cancellation');
 controller.abort();const result=await response;
 assert(result.status!==200&&run.state.settlement==='unresolved'&&run.state.outstanding===1,'aborting await does not settle the underlying operation');
 run.resolveProvider({summary:'synthetic late ignored output'});
});
Deno.test('lost admission acknowledgment preserves unknown committed work without fallback',async()=>{
 const run=admissionFixture({admissionAckLost:true,totalRequestTimeoutMs:20});
 const response=await run.handler(run.validWeeklyRequest());
 assert(response.status===503&&run.state.providerCalls===0&&run.state.outstanding===1,'lost admission cannot dispatch or erase work');
 assert(!run.state.settlement&&run.state.legacyCalls===0,'unknown ticket is never invented or retried through legacy RPC');
});
Deno.test('lost dispatch authorization acknowledgment is unresolved even without a provider fetch',async()=>{
 const run=admissionFixture({authorizationAckLost:true,totalRequestTimeoutMs:20});
 const response=await run.handler(run.validWeeklyRequest());
 assert(response.status===503&&run.state.providerCalls===0&&run.state.authorized===1,'authorization committed but acknowledgment was lost');
 assert(run.state.settlement==='unresolved'&&run.state.outstanding===1,'unknown authorization cannot be labeled stopped-before-dispatch');
});
