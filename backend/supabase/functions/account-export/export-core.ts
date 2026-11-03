import {isOwnerExportDocument,OWNER_EXPORT_MAX_BYTES} from '../../../../packages/shared/src/data/owner-export-contract.ts';
export interface ExportDependencies {
 authenticate(authorization:string,signal:AbortSignal):Promise<{userId:string;sessionId:string}|null>;
 createServiceClient(signal:AbortSignal):{rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>};
 corsHeaders(origin:string|null):Record<string,string>;
}
function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function abortable<T>(value:PromiseLike<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(new Error('Export stopped.'));
  // A request-bound adapter can abort synchronously while creating its promise.
  Promise.resolve(value).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  if(signal.aborted){abort();return;}
  signal.addEventListener('abort',abort,{once:true});
 });
}
async function bodyOf(request:Request,signal:AbortSignal){
 const reader=request.body?.getReader();if(!reader)throw Error('body');let size=0;const parts:Uint8Array[]=[];
 try{for(;;){const {done,value}=await abortable(reader.read(),signal);if(done)break;size+=value.length;if(size>1024)throw Error('size');parts.push(value);}}
 finally{void reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 const body:unknown=JSON.parse(new TextDecoder().decode(bytes));if(!record(body))throw Error('body');return body;
}
function errorStatus(error:unknown){
 if(!record(error))return 503;
 return ({EX001:401,EX002:403,EX003:503,EX004:413,EX005:409} as Record<string,number>)[String(error.code)]??503;
}
const messages:Record<number,string>={400:'Invalid export request.',401:'Sign in again to download your data.',403:'Your account or email verification changed. Check it and try again.',
 409:'Media needs assisted export. Contact support to complete your request.',413:'Your data exceeds automatic download limits. Contact support.',503:'Your data download is unavailable. Try again or contact support.'};
export function createOwnerExportHandler(dependencies:ExportDependencies){
 return async(request:Request):Promise<Response>=>{
  let cors:Record<string,string>={};
  const response=(body:unknown,status:number)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Cache-Control':'private, no-store','Pragma':'no-cache',
   'Content-Type':'application/json','X-Content-Type-Options':'nosniff','Vary':'Origin'}});
  const fail=(status:number)=>response({error:messages[status]??'Request unavailable.'},status);
  try{
   const origin=request.headers.get('Origin');cors=dependencies.corsHeaders(origin);
   if(origin&&cors['Access-Control-Allow-Origin']!==origin){cors={};return fail(403);}
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Cache-Control':'private, no-store','Vary':'Origin'}});
   if(request.method!=='POST')return fail(405);
   if(new URL(request.url).search)return fail(400);
   const signal=AbortSignal.any([request.signal,AbortSignal.timeout(15_000)]);
   if(signal.aborted)return fail(503);
   let body:Record<string,unknown>;
   try{body=await bodyOf(request,signal);}catch{return fail(signal.aborted?503:400);}
   const fields=Object.keys(body);
   if(body.action==='snapshot'){
    if(fields.length!==1)return fail(400);
   }else if(body.action==='check'){
    if(fields.length!==2||!fields.includes('mailboxVersion')||!Number.isSafeInteger(body.mailboxVersion)||(body.mailboxVersion as number)<1)return fail(400);
   }else return fail(400);
   const authorization=request.headers.get('Authorization');if(!authorization||!/^Bearer [^\s]+$/.test(authorization)||authorization.length>16384)return fail(401);
   const user=await abortable(dependencies.authenticate(authorization,signal),signal);
   if(!user||!uuid.test(user.userId)||!uuid.test(user.sessionId))return fail(401);
   const service=dependencies.createServiceClient(signal);
   const identity={p_user_id:user.userId,p_session_id:user.sessionId};
   if(body.action==='check'){
    const {data,error}=await abortable(service.rpc('owner_export_check',{...identity,p_mailbox_version:body.mailboxVersion}),signal);
    if(error)return fail(errorStatus(error));if(data!==true)return fail(data===false?403:503);
    return response({allowed:true,mailboxVersion:body.mailboxVersion},200);
   }
   const {data,error}=await abortable(service.rpc('owner_export_snapshot',identity),signal);
   if(error)return fail(errorStatus(error));
   const encoded=JSON.stringify(data);if(typeof encoded!=='string')return fail(503);
   if(new TextEncoder().encode(encoded).length>OWNER_EXPORT_MAX_BYTES)return fail(413);
   if(!isOwnerExportDocument(data,user.userId))return fail(503);
   const final=await abortable(service.rpc('owner_export_check',{...identity,p_mailbox_version:data.mailboxVersion}),signal);
   if(final.error)return fail(errorStatus(final.error));if(final.data!==true)return fail(final.data===false?403:503);
   if(signal.aborted)return fail(503);
   return response(data,200);
  }catch{return fail(503);}
 };
}
