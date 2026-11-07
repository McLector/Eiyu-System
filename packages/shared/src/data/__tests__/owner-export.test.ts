const getSession=jest.fn();const onAuthStateChange=jest.fn();
jest.mock('../../supabase/client',()=>({supabase:{auth:{getSession:(...args:unknown[])=>getSession(...args),onAuthStateChange:(...args:unknown[])=>onAuthStateChange(...args)}}}));
import {beginOwnerExport,initOwnerExportTransport} from '../owner-export';
import {OWNER_EXPORT_SECTION_FIELDS,type OwnerExportDocument} from '../owner-export-contract';
const uid='e5200000-0000-4000-8000-000000000001';
type Session={user:{id:string};access_token:string}|null;
type Listener=(event:string,session:Session)=>void;
let session:Session;const listeners=new Set<Listener>();const unsubscribe=jest.fn();const fetcher=jest.fn();
function doc():OwnerExportDocument{
 const sections:OwnerExportDocument['sections']={};for(const table of Object.keys(OWNER_EXPORT_SECTION_FIELDS))sections[table]=[];
 sections['public.habits']=[Object.fromEntries(OWNER_EXPORT_SECTION_FIELDS['public.habits'].map(k=>[k,k==='user_id'?uid:k==='name'?'Synthetic owned export':null]))];
 return {schemaVersion:1,generatedAt:'2026-10-22T05:00:00.000Z',accountId:uid,mailboxVersion:1,
  account:{email:'synthetic-export@example.invalid',createdAt:'2026-10-22T05:00:00.000Z',signup:{displayName:null,timeZone:null}},sections,omissions:[]};
}
function response(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});}
function emit(id:string|null,event='SIGNED_IN'){
 session=id?{user:{id},access_token:id===uid?'synthetic-bearer-a':'synthetic-bearer-b'}:null;
 for(const listener of [...listeners])listener(event,session);
}
function configure(url='http://127.0.0.1:57321'){
 initOwnerExportTransport({url,publishableKey:'synthetic-public-only',fetcher});
}
async function until(predicate:()=>boolean){for(let i=0;i<50&&!predicate();i++)await Promise.resolve();if(!predicate())throw Error('Synthetic stage not reached');}
beforeEach(()=>{
 listeners.clear();unsubscribe.mockReset();fetcher.mockReset();session={user:{id:uid},access_token:'synthetic-bearer-a'};
 getSession.mockReset().mockImplementation(async()=>({data:{session},error:null}));
 onAuthStateChange.mockReset().mockImplementation((listener:Listener)=>{
  listeners.add(listener);const initial=session;
  void Promise.resolve().then(()=>{if(listeners.has(listener))listener('INITIAL_SESSION',initial);});
  return {data:{subscription:{unsubscribe:()=>{listeners.delete(listener);unsubscribe();}}}};
 });
 fetcher.mockImplementation(async(_url,init)=>response(JSON.parse(init.body).action==='snapshot'?doc():{allowed:true,mailboxVersion:1}));
 configure();
});
afterEach(()=>{emit(null,'SIGNED_OUT');listeners.clear();jest.useRealTimers();});

it('uses exactly the reviewed field manifest in every export section',()=>{
 const approved=require('../../../../../scripts/fixtures/owner-export-manifest.json') as {tables:Array<{scope:string;table:string;export:string[]}>};
 expect(OWNER_EXPORT_SECTION_FIELDS).toEqual(Object.fromEntries(approved.tables.filter(t=>t.scope!=='global').map(t=>[t.table,t.export])));
});
it('initialization makes no Auth, data, inference or download call',()=>{
 expect(getSession).not.toHaveBeenCalled();expect(onAuthStateChange).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
});
it('public shared barrel exposes export operations without eager Auth or transport',()=>{
 const shared=jest.requireActual<Record<string,unknown>>('../../index');
 expect(shared.beginOwnerExport).toBe(beginOwnerExport);expect(shared.initOwnerExportTransport).toBe(initOwnerExportTransport);
 expect(getSession).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
});
it('pins the exact authorization and uses private streaming requests for snapshot and confirm',async()=>{
 const operation=await beginOwnerExport(uid);expect(operation.document.accountId).toBe(uid);expect(operation.current()).toBe(true);
 expect(fetcher).toHaveBeenCalledTimes(1);
 const [url,init]=fetcher.mock.calls[0];expect(url).toBe('http://127.0.0.1:57321/functions/v1/account-export');
 expect(init).toMatchObject({method:'POST',credentials:'omit',redirect:'error',headers:{Authorization:'Bearer synthetic-bearer-a',apikey:'synthetic-public-only'}});
 expect(JSON.parse(init.body)).toEqual({action:'snapshot'});
 await operation.confirm();expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({action:'check',mailboxVersion:1});
 expect(fetcher.mock.calls[1][1].headers.Authorization).toBe(init.headers.Authorization);
 operation.dispose();expect(unsubscribe).toHaveBeenCalledTimes(1);
});
it('never invokes transport for another starting owner',async()=>{
 await expect(beginOwnerExport('foreign-owner')).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();expect(unsubscribe).toHaveBeenCalledTimes(1);
});
it('requires initial session observation before declaring an operation ready',async()=>{
 jest.useFakeTimers();onAuthStateChange.mockImplementation((listener:Listener)=>{
  listeners.add(listener);return {data:{subscription:{unsubscribe:()=>{listeners.delete(listener);unsubscribe();}}}};
 });
 const pending=beginOwnerExport(uid);const rejected=expect(pending).rejects.toThrow();jest.advanceTimersByTime(15000);await rejected;
 expect(fetcher).not.toHaveBeenCalled();expect(unsubscribe).toHaveBeenCalledTimes(1);
});
it('discards a held result across A→B→A without automatic retry',async()=>{
 let release!:(value:Response)=>void;fetcher.mockImplementationOnce(()=>new Promise<Response>(resolve=>{release=resolve;}));
 const pending=beginOwnerExport(uid);const rejected=expect(pending).rejects.toThrow();await until(()=>fetcher.mock.calls.length===1);
 emit('foreign-owner');emit(uid);await rejected;release(response(doc()));
 expect(fetcher).toHaveBeenCalledTimes(1);expect(unsubscribe).toHaveBeenCalledTimes(1);
});
it('does not use a late token lookup after an intervening identity transition',async()=>{
 let release!:(value:unknown)=>void;getSession.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 const pending=beginOwnerExport(uid);const rejected=expect(pending).rejects.toThrow();await until(()=>getSession.mock.calls.length===1);
 emit('foreign-owner');emit(uid);release({data:{session:{user:{id:uid},access_token:'synthetic-bearer-a'}},error:null});
 await rejected;expect(fetcher).not.toHaveBeenCalled();expect(unsubscribe).toHaveBeenCalledTimes(1);
});
it('cleans up synchronous sign-out during subscription setup',async()=>{
 onAuthStateChange.mockImplementation((listener:Listener)=>{
  listener('INITIAL_SESSION',session);listener('SIGNED_OUT',null);
  return {data:{subscription:{unsubscribe}}};
 });
 await expect(beginOwnerExport(uid)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();expect(unsubscribe).toHaveBeenCalledTimes(1);
});
it('consumes a rejected token lookup that also synchronously signs out',async()=>{
 getSession.mockImplementationOnce(()=>{emit(null,'SIGNED_OUT');return Promise.reject(new Error('synthetic lookup canceled'));});
 await expect(beginOwnerExport(uid)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();expect(unsubscribe).toHaveBeenCalledTimes(1);
});
it.each(['SIGNED_OUT','TOKEN_REFRESHED','SIGNED_IN','USER_UPDATED'])('invalidates a ready operation on %s',async event=>{
 const operation=await beginOwnerExport(uid);emit(event==='SIGNED_OUT'?null:uid,event);
 expect(operation.current()).toBe(false);expect(()=>operation.document).toThrow();
 await expect(operation.confirm()).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);
});
it('disposal clears access and prevents a later confirm',async()=>{
 const operation=await beginOwnerExport(uid);operation.dispose();operation.dispose();
 expect(operation.current()).toBe(false);expect(()=>operation.document).toThrow();await expect(operation.confirm()).rejects.toThrow();
 expect(unsubscribe).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledTimes(1);
});
it('caller cancellation aborts a pending begin before an operation exists',async()=>{
 const controller=new AbortController();let release!:(value:Response)=>void;
 fetcher.mockImplementationOnce(()=>new Promise<Response>(resolve=>{release=resolve;}));
 const pending=beginOwnerExport(uid,{signal:controller.signal});const rejected=expect(pending).rejects.toThrow();
 await until(()=>fetcher.mock.calls.length===1);const signal=fetcher.mock.calls[0][1].signal as AbortSignal;
 controller.abort();const stopped=signal.aborted;
 emit(null,'SIGNED_OUT');await rejected;release(response(doc()));
 expect(stopped).toBe(true);expect(unsubscribe).toHaveBeenCalledTimes(1);
});
it('already aborted caller makes no Auth or network call',async()=>{
 const controller=new AbortController();controller.abort();
 await expect(beginOwnerExport(uid,{signal:controller.signal})).rejects.toThrow();
 expect(onAuthStateChange).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
});
it('caller cancellation clears a ready document',async()=>{
 const controller=new AbortController();
 const operation=await beginOwnerExport(uid,{signal:controller.signal});controller.abort();
 const stopped=!operation.current();operation.dispose();expect(stopped).toBe(true);
});
it('configuration changes cannot send an old operation to a different origin',async()=>{
 const operation=await beginOwnerExport(uid);configure('https://different.invalid');expect(operation.current()).toBe(false);
 await expect(operation.confirm()).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);
});
it('missing transport leaves only export unavailable',async()=>{
 initOwnerExportTransport(null);await expect(beginOwnerExport(uid)).rejects.toThrow();expect(getSession).not.toHaveBeenCalled();
});
it.each([401,403,409,413,500])('uses a fixed safe error for HTTP %s',async status=>{
 fetcher.mockResolvedValue(response({error:'PRIVATE_SYNTHETIC_SERVER_DETAIL'},status));
 const error=await beginOwnerExport(uid).catch(e=>e as Error);
 expect(error).toBeInstanceOf(Error);expect((error as Error).message).not.toContain('PRIVATE_SYNTHETIC_SERVER_DETAIL');
 expect(unsubscribe).toHaveBeenCalledTimes(1);
});
it('refuses missing capability or malformed/foreign documents',async()=>{
 for(const value of [{}, {...doc(),accountId:'foreign'}, {...doc(),secret:'synthetic-private'}]){
  fetcher.mockResolvedValueOnce(response(value));await expect(beginOwnerExport(uid)).rejects.toThrow();
 }
});
it('stops an oversized stream before parsing or producing an operation',async()=>{
 const cancel=jest.fn();const bytes=new TextEncoder().encode('x'.repeat(5242881));
 fetcher.mockResolvedValueOnce(new Response(new ReadableStream({start(controller){controller.enqueue(bytes);},cancel}),{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}}));
 await expect(beginOwnerExport(uid)).rejects.toThrow();expect(cancel).toHaveBeenCalledTimes(1);
});
it('never falls back to an unbounded text/json read when streaming is unavailable',async()=>{
 const text=jest.fn(),json=jest.fn();fetcher.mockResolvedValueOnce({status:200,headers:new Headers({'Content-Type':'application/json','Cache-Control':'private, no-store'}),body:null,text,json});
 await expect(beginOwnerExport(uid)).rejects.toThrow();expect(text).not.toHaveBeenCalled();expect(json).not.toHaveBeenCalled();
});
it('rejects invalid UTF8 instead of silently replacing account data',async()=>{
 const text=JSON.stringify(doc()),bytes=new TextEncoder().encode(text);bytes[text.indexOf('Synthetic owned export')]=255;
 fetcher.mockResolvedValueOnce(new Response(bytes,{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}));
 await expect(beginOwnerExport(uid)).rejects.toThrow();
});
it('uses declared oversized length to refuse before reading the body',async()=>{
 const read=jest.fn(),cancel=jest.fn(async()=>{});
 fetcher.mockResolvedValueOnce({status:200,headers:new Headers({'Content-Type':'application/json','Cache-Control':'no-store','Content-Length':'5242881'}),body:{getReader:()=>({read,cancel})}});
 await expect(beginOwnerExport(uid)).rejects.toThrow();expect(read).not.toHaveBeenCalled();expect(cancel).toHaveBeenCalledTimes(1);
});
it('refuses cacheable success responses from an incompatible endpoint',async()=>{
 fetcher.mockResolvedValueOnce(new Response(JSON.stringify(doc()),{headers:{'Content-Type':'application/json'}}));
 await expect(beginOwnerExport(uid)).rejects.toThrow();
});
it('refuses a mutated document before any confirmation transport',async()=>{
 const operation=await beginOwnerExport(uid);Object.assign(operation.document,{unreviewed:'synthetic'});
 await expect(operation.confirm()).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);expect(operation.current()).toBe(false);
});
it('refuses indirect rows not linked through the subject logical requests',async()=>{
 const data=doc();data.sections['private.ai_provider_attempts']=[{request_id:'foreign-request',attempt_number:1,usage_date:'2026-10-22',created_at:'2026-10-22T05:00:00Z'}];
 fetcher.mockResolvedValueOnce(response(data));await expect(beginOwnerExport(uid)).rejects.toThrow();
});
it('requires exact final acknowledgment and original mailbox version',async()=>{
 const operation=await beginOwnerExport(uid);fetcher.mockResolvedValueOnce(response({allowed:true,mailboxVersion:2}));
 await expect(operation.confirm()).rejects.toThrow();expect(operation.current()).toBe(false);
});
it('does not turn a proof change into another snapshot automatically',async()=>{
 const operation=await beginOwnerExport(uid);fetcher.mockResolvedValueOnce(response({error:'changed'},403));
 await expect(operation.confirm()).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(2);expect(operation.current()).toBe(false);
});
