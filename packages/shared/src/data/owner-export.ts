import {supabase} from '../supabase/client';
import {authorizationForOwner} from '../supabase/authorization';
import {isOwnerExportDocument,OWNER_EXPORT_MAX_BYTES,type OwnerExportDocument} from './owner-export-contract';
export interface OwnerExportOperation {readonly document:OwnerExportDocument;current():boolean;confirm():Promise<void>;dispose():void;}
export interface OwnerExportHttpResponse {
 status:number;headers:{get(name:string):string|null};
 body:{getReader():{read():Promise<{done?:boolean;value?:Uint8Array}>;cancel(reason?:unknown):Promise<unknown>}}|null;
}
export interface OwnerExportTransportConfig {
 url:string;publishableKey:string;
 fetcher(url:string,init:{method:'POST';headers:Record<string,string>;body:string;signal:AbortSignal;credentials:'omit';redirect:'error'}):Promise<OwnerExportHttpResponse>;
}
type ErrorCode='sign-in'|'verification'|'media'|'limit'|'unavailable'|'changed'|'cancelled';
const messages:Record<ErrorCode,string>={
 'sign-in':'Sign in again to download your data.',
 verification:'Your account or email verification changed. Check it and try again.',
 media:'Media needs assisted export. Contact support to complete your request.',
 limit:'Your data exceeds automatic download limits. Contact support.',
 unavailable:'Your data download is unavailable. Try again or contact support.',
 changed:'Your account or verification changed. Start a new download.',
 cancelled:'Data download canceled.',
};
export class OwnerExportError extends Error{constructor(readonly code:ErrorCode){super(messages[code]);this.name='OwnerExportError';}}
type Transport=OwnerExportTransportConfig&{endpoint:string};
let transport:Transport|undefined;
const transportChanges=new Set<()=>void>();
export function initOwnerExportTransport(config:OwnerExportTransportConfig|null):void{
 transport=undefined;
 try{
  if(config&&config.publishableKey.trim()&&!config.publishableKey.startsWith('sb_secret_')&&typeof config.fetcher==='function'){
   const url=new URL(config.url);
   if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash){
    const base=url.href.endsWith('/')?url.href:url.href+'/';
    transport={...config,endpoint:new URL('functions/v1/account-export',base).href};
   }
  }
 }catch{/* Export stays unavailable; ordinary Auth/tracker initialization continues. */}
 for(const listener of [...transportChanges])listener();
}
function abortable<T>(promise:PromiseLike<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(new OwnerExportError('unavailable'));
  // Consume the supplied promise even if its creator already triggered abort.
  Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});
 });
}
function cancelBody(response:OwnerExportHttpResponse){try{void response.body?.getReader().cancel().catch(()=>{});}catch{/* Body may already be owned/closed. */}}
async function readJson(response:OwnerExportHttpResponse,signal:AbortSignal,limit:number):Promise<unknown>{
 if(response.status!==200){cancelBody(response);throw new OwnerExportError(({401:'sign-in',403:'verification',409:'media',413:'limit'} as Record<number,ErrorCode>)[response.status]??'unavailable');}
 const type=response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
 if(type!=='application/json'||!/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('Cache-Control')??'')){
  cancelBody(response);throw new OwnerExportError('unavailable');
 }
 const length=response.headers.get('Content-Length');
 if(length!==null&&/^\d+$/.test(length)&&Number(length)>limit){cancelBody(response);throw new OwnerExportError('limit');}
 if(!response.body)throw new OwnerExportError('unavailable');
 const reader=response.body.getReader();const parts:Uint8Array[]=[];let size=0;
 try{
  for(;;){
   const result=await abortable(reader.read(),signal);if(result.done)break;
   if(!(result.value instanceof Uint8Array))throw new OwnerExportError('unavailable');
   size+=result.value.length;if(size>limit)throw new OwnerExportError('limit');parts.push(result.value);
  }
 }finally{void reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 const text=new TextDecoder().decode(bytes),roundTrip=new TextEncoder().encode(text);
 // SDK54 supports UTF8. Round-trip validation avoids assuming native fatal mode.
 if(roundTrip.length!==bytes.length||roundTrip.some((b,i)=>b!==bytes[i]))throw new OwnerExportError('unavailable');
 return JSON.parse(text) as unknown;
}
export async function beginOwnerExport(userId:string,options:{signal?:AbortSignal}={}):Promise<OwnerExportOperation>{
 if(options.signal?.aborted)throw new OwnerExportError('cancelled');
 const candidate=transport;if(!candidate)throw new OwnerExportError('unavailable');const config:Transport=candidate;
 const lifetime=new AbortController();let active=true,reason:ErrorCode='cancelled';
 let subscription:{unsubscribe():void}|undefined;let initialSeen=false,initialOwner:string|undefined,initialHeader:string|undefined;
 let header:string|undefined,document:OwnerExportDocument|undefined;
 let resolveInitial!:()=>void;const initialized=new Promise<void>(resolve=>{resolveInitial=resolve;});
 const cleanup=()=>{const owned=subscription;subscription=undefined;try{owned?.unsubscribe();}catch{/* No raw Auth error retained. */}transportChanges.delete(configurationChanged);options.signal?.removeEventListener('abort',callerCancelled);};
 const invalidate=(code:ErrorCode)=>{if(!active)return;active=false;reason=code;header=undefined;initialHeader=undefined;document=undefined;lifetime.abort();cleanup();};
 const configurationChanged=()=>invalidate('changed');
 const callerCancelled=()=>invalidate('cancelled');
 const ensure=()=>{if(!active||transport!==config){if(active)invalidate('changed');throw new OwnerExportError(reason);}};
 async function budget<T>(work:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  const controller=new AbortController(),stopAt=Date.now()+15000;
  const abort=()=>controller.abort();lifetime.signal.addEventListener('abort',abort,{once:true});
  if(lifetime.signal.aborted)abort();const timer=setTimeout(abort,15000);
  try{const value=await abortable(work(controller.signal),controller.signal);if(controller.signal.aborted||Date.now()>=stopAt)throw new OwnerExportError('unavailable');return value;}
  finally{clearTimeout(timer);lifetime.signal.removeEventListener('abort',abort);}
 }
 async function post(body:Record<string,unknown>,signal:AbortSignal,limit:number){
  ensure();if(!header)throw new OwnerExportError('sign-in');
  const pending=Promise.resolve(config.fetcher(config.endpoint,{method:'POST',headers:{Authorization:header,apikey:config.publishableKey,'Content-Type':'application/json',Accept:'application/json'},
   body:JSON.stringify(body),signal,credentials:'omit',redirect:'error'}));
  void pending.then(response=>{if(signal.aborted)cancelBody(response);},()=>{});
  const response=await abortable(pending,signal);ensure();return await readJson(response,signal,limit);
 }
 function safeError(error:unknown){return !active?new OwnerExportError(reason):error instanceof OwnerExportError?error:new OwnerExportError('unavailable');}
 try{
  options.signal?.addEventListener('abort',callerCancelled,{once:true});
  if(options.signal?.aborted)callerCancelled();ensure();
  transportChanges.add(configurationChanged);
  const result=supabase.auth.onAuthStateChange((event,session)=>{
   if(!active)return;
   if(event==='INITIAL_SESSION'&&!initialSeen){
    initialSeen=true;initialOwner=session?.user.id;initialHeader=session?.access_token?`Bearer ${session.access_token}`:undefined;resolveInitial();
   }else invalidate('changed');
  });
  subscription=result.data.subscription;if(!active)cleanup();
  const data=await budget(async signal=>{
   await abortable(initialized,signal);ensure();
   if(initialOwner!==userId||!initialHeader)throw new OwnerExportError('sign-in');
   const authorization=await abortable(authorizationForOwner(userId,messages['sign-in']),signal);ensure();
   if(authorization!==initialHeader)throw new OwnerExportError('changed');header=authorization;initialHeader=undefined;
   return await post({action:'snapshot'},signal,OWNER_EXPORT_MAX_BYTES);
  });
  ensure();if(!isOwnerExportDocument(data,userId))throw new OwnerExportError('unavailable');
  document=data;const mailboxVersion=data.mailboxVersion;
  return {
   get document(){ensure();if(!document)throw new OwnerExportError('unavailable');return document;},
   current:()=>active&&transport===config&&document!==undefined,
   confirm:async()=>{
    try{
     ensure();if(!document||!isOwnerExportDocument(document,userId)||document.mailboxVersion!==mailboxVersion)throw new OwnerExportError('unavailable');
     const acknowledgment=await budget(signal=>post({action:'check',mailboxVersion},signal,1024));ensure();
     if(!acknowledgment||typeof acknowledgment!=='object'||Array.isArray(acknowledgment))throw new OwnerExportError('unavailable');
     const value=acknowledgment as Record<string,unknown>;
     if(Object.keys(value).length!==2||value.allowed!==true||value.mailboxVersion!==mailboxVersion)throw new OwnerExportError('verification');
    }catch(error){const safe=safeError(error);invalidate(safe.code);throw safe;}
   },
   dispose:()=>invalidate('cancelled'),
  };
 }catch(error){const safe=safeError(error);invalidate(safe.code);throw safe;}
}
