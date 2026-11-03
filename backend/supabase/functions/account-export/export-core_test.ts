import {createOwnerExportHandler, type ExportDependencies} from './export-core.ts';
import manifest from '../../../../scripts/fixtures/owner-export-manifest.json' with {type:'json'};
const uid='e5200000-0000-4000-8000-000000000001',sid='e5200000-0000-4000-8000-000000000011';
function document(){
 const sections:Record<string,Record<string,unknown>[]>={};
 for(const spec of manifest.tables)if(spec.scope!=='global')sections[spec.table]=[];
 const spec=manifest.tables.find(s=>s.table==='public.habits')!;
 sections['public.habits']=[Object.fromEntries(spec.export.map(k=>[k,k==='user_id'?uid:k==='name'?'SYNTHETIC_EXPORT_MARKER':null]))];
 return {schemaVersion:1,generatedAt:'2026-10-22T05:00:00.000Z',accountId:uid,
  account:{email:'synthetic-export@example.invalid',createdAt:'2026-10-22T05:00:00.000Z',signup:{displayName:null,timeZone:null,birthDate:null,ageScreening:{granted:null,noticeVersion:null}}},
  mailboxVersion:1,sections,omissions:['Security fields excluded.']};
}
const authHeaders={Authorization:'Bearer synthetic-only','Content-Type':'application/json'};
function fixture(overrides:Partial<ExportDependencies>={}){
 const calls:Array<{name:string;args:Record<string,unknown>}> = [];let auth=0;
 const deps:ExportDependencies={authenticate:async()=>{auth++;return {userId:uid,sessionId:sid};},
  createServiceClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:name==='owner_export_snapshot'?document():true,error:null};}}),
  corsHeaders:origin=>{const headers:Record<string,string>={};if(origin==='http://localhost:5173')headers['Access-Control-Allow-Origin']=origin;return headers;},...overrides};
 const run=(body:unknown={action:'snapshot'},headers:Record<string,string>=authHeaders,signal?:AbortSignal)=>createOwnerExportHandler(deps)(
  new Request('http://local.test/export',{method:'POST',headers,body:JSON.stringify(body),signal}));
 return {run,deps,calls,auth:()=>auth};
}
function expect(value:unknown,message:string):asserts value{if(!value)throw Error(message);}
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
Deno.test('export uses derived identity, snapshot then fresh check, and private headers',async()=>{
 const f=fixture();const response=await f.run();expect(response.status===200,'expected owner export');
 expect(f.calls.map(c=>c.name).join(',')==='owner_export_snapshot,owner_export_check','fresh check must follow snapshot');
 expect(f.calls.every(c=>c.args.p_user_id===uid&&c.args.p_session_id===sid),'only trusted identity may reach RPC');
 expect(f.calls[1].args.p_mailbox_version===1,'captured proof revision required');
 expect(response.headers.get('Cache-Control')==='private, no-store'&&response.headers.get('X-Content-Type-Options')==='nosniff','private response headers');
 expect((await response.json()).accountId===uid,'subject-only envelope');
});
Deno.test('export rejects selectors, malformed and oversized requests before privileged reads',async()=>{
 const f=fixture();for(const body of [{action:'snapshot',userId:'foreign'},{action:'snapshot',sessionId:sid},{action:'check',mailboxVersion:0},
 {action:'check',mailboxVersion:1.2},{action:'check',mailboxVersion:1,extra:true},{action:'unknown'},[],null,{action:'snapshot',padding:'x'.repeat(1200)}]){
  expect((await f.run(body)).status===400,'invalid request accepted');
 }expect(f.calls.length===0&&f.auth()===0,'invalid request must stop before Auth/SQL');
});
Deno.test('export missing or invalid Auth makes no privileged call',async()=>{
 const f=fixture();expect((await f.run({action:'snapshot'},{})).status===401,'missing bearer denied');
 const invalid=fixture({authenticate:async()=>null});expect((await invalid.run()).status===401,'invalid bearer denied');
 const malformed=fixture({authenticate:async()=>({userId:uid,sessionId:'malformed'})});expect((await malformed.run()).status===401,'invalid session identity denied');
 expect(f.calls.length+invalid.calls.length+malformed.calls.length===0,'no privileged read');
});
Deno.test('export empty or whitespace bearer is refused before Auth',async()=>{
 const f=fixture();for(const Authorization of ['Bearer ','Bearer synthetic token','Basic synthetic']){
  expect((await f.run({action:'snapshot'},{...authHeaders,Authorization})).status===401,'malformed bearer denied');
 }expect(f.auth()===0&&f.calls.length===0,'malformed bearer must stop before private work');
});
Deno.test('export checks CORS origin and method before Auth or snapshot',async()=>{
 const f=fixture();const handler=createOwnerExportHandler(f.deps);
 expect((await handler(new Request('http://local/export',{method:'GET'}))).status===405,'GET refused');
 expect((await handler(new Request('http://local/export',{method:'OPTIONS',headers:{Origin:'http://localhost:5173'}}))).status===204,'known preflight');
 expect((await f.run({action:'snapshot'},{...authHeaders,Origin:'https://foreign.invalid'})).status===403,'foreign browser origin denied');
 expect(f.auth()===0&&f.calls.length===0,'origin/method guard before private work');
 expect((await f.run()).status===200,'native request without Origin supported');
});
Deno.test('export refuses bearer query parameters without invoking Auth',async()=>{
 const f=fixture();const response=await createOwnerExportHandler(f.deps)(new Request('http://local/export?access_token=synthetic-only',
  {method:'POST',headers:authHeaders,body:'{"action":"snapshot"}'}));
 expect(response.status===400&&f.auth()===0,'query token not an export channel');
});
Deno.test('export check action is only a fresh authorization acknowledgment',async()=>{
 const f=fixture();const response=await f.run({action:'check',mailboxVersion:3});
 expect(response.status===200&&f.calls.length===1&&f.calls[0].name==='owner_export_check','check must not create snapshot');
 expect(f.calls[0].args.p_mailbox_version===3,'requested captured version passed');
 const body=await response.json();expect(body.allowed===true&&body.mailboxVersion===3&&!('sections' in body),'only acknowledgment');
});
for(const [code,status] of [['EX001',401],['EX002',403],['EX003',503],['EX004',413],['EX005',409],['UNKNOWN',503]] as const){
 Deno.test(`export maps ${code} without raw backend details`,async()=>{
  const f=fixture({createServiceClient:()=>({rpc:async()=>({data:null,error:{code,message:'PRIVATE_SYNTHETIC_ERROR'}})})});
  const response=await f.run();expect(response.status===status,'fixed error classification');
  expect(!(await response.text()).includes('PRIVATE_SYNTHETIC_ERROR'),'raw error not returned');
 });
}
Deno.test('export proof/session loss after held snapshot never releases its contents',async()=>{
 const held=deferred<{data:unknown;error:null}>();let entered=false;
 const f=fixture({createServiceClient:()=>({rpc:async name=>{if(name==='owner_export_snapshot'){entered=true;return await held.promise;}return {data:false,error:null};}})});
 const pending=f.run();while(!entered)await new Promise(r=>setTimeout(r,0));held.resolve({data:document(),error:null});
 const response=await pending;expect(response.status===403,'changed permission denied');
 expect(!(await response.text()).includes('SYNTHETIC_EXPORT_MARKER'),'held content must be discarded');
});
Deno.test('export lost or malformed final acknowledgments are unavailable',async()=>{
 for(const value of [null,'true',{},1]){
  const f=fixture({createServiceClient:()=>({rpc:async name=>({data:name==='owner_export_snapshot'?document():value,error:null})})});
  expect((await f.run()).status===503,'must require exact true acknowledgment');
 }
});
Deno.test('export malformed envelopes and excluded row fields never leave handler',async()=>{
 const bad:unknown[]=[null,{}, {...document(),accountId:'foreign'}, {...document(),secret:'unexpected'},
  {...document(),sections:{...document().sections,'auth.users':[]}}];
 const field=document();field.sections['public.habits'][0].challenge_id='synthetic-private-reference';bad.push(field);
 for(const data of bad){const f=fixture({createServiceClient:()=>({rpc:async()=>({data,error:null})})});
  expect((await f.run()).status===503,'malformed/private output must not be returned');}
});
Deno.test('export oversized backend document is not returned',async()=>{
 const data=document();data.sections['public.habits'][0].name='x'.repeat(5242881);
 const f=fixture({createServiceClient:()=>({rpc:async()=>({data,error:null})})});expect((await f.run()).status===413,'bounded export response');
});
Deno.test('export client abort while snapshot remains pending releases no data',async()=>{
 const held=deferred<{data:unknown;error:null}>();let entered=false;
 const f=fixture({createServiceClient:()=>({rpc:async()=>{entered=true;return await held.promise;}})});
 const controller=new AbortController();const pending=f.run({action:'snapshot'},authHeaders,controller.signal);
 while(!entered)await new Promise(r=>setTimeout(r,0));controller.abort();
 const response=await pending;expect(response.status===503,'cancel ends bounded local wait');
 expect(!(await response.text()).includes('SYNTHETIC_EXPORT_MARKER'),'cancel cannot return export');
 held.resolve({data:document(),error:null});
});
Deno.test('export reentrant abort consumes the rejected RPC promise',async()=>{
 let unhandled=0;const observe=(event:PromiseRejectionEvent)=>{event.preventDefault();unhandled++;};
 globalThis.addEventListener('unhandledrejection',observe);
 try{
  const controller=new AbortController();
  const f=fixture({createServiceClient:()=>({rpc:()=>{controller.abort();return Promise.reject(Error('synthetic canceled RPC'));}})});
  const response=await f.run({action:'snapshot'},authHeaders,controller.signal);
  await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0));
  expect(response.status===503,'canceled response unavailable');expect(unhandled===0,'abandoned RPC rejection must be consumed');
 }finally{globalThis.removeEventListener('unhandledrejection',observe);}
});
