type Result = { data?: unknown; error: unknown };
type Identity = { id: string; email?: string };
export type MailboxDependencies = {
 authenticate: (authorization:string,signal:AbortSignal)=>Promise<Identity|null>;
 createServiceClient: (signal:AbortSignal)=>{rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<Result>};
 createOtpClient: (signal:AbortSignal)=>{auth:{
  signInWithOtp:(args:{email:string;options:{shouldCreateUser:false}})=>Promise<{error:unknown}>;
  verifyOtp:(args:{email:string;token:string;type:'email'})=>Promise<{data:{user:Identity|null;session:unknown};error:unknown}>;
  signOut:(args:{scope:'local'})=>Promise<{error:unknown}>;
 }};
 corsHeaders?: (origin:string|null)=>Record<string,string>;
};
const invalid='That code could not be verified. Request a new code if it expired.';
const unavailable='Email verification is temporarily unavailable. Please try again later.';
function object(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
async function bodyOf(request:Request):Promise<Record<string,unknown>>{
 if(Number(request.headers.get('Content-Length'))>4096)throw Error('size');
 const reader=request.body?.getReader();if(!reader)throw Error('body');
 const parts:Uint8Array[]=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096)throw Error('size');parts.push(value);}}
 finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 const body=JSON.parse(new TextDecoder().decode(bytes));if(!object(body))throw Error('body');return body;
}
export function createMailboxHandler(deps:MailboxDependencies){
 return async(request:Request):Promise<Response>=>{
  const cors=deps.corsHeaders?.(request.headers.get('Origin'))??{};
  const response=(data:unknown,status:number,retryAfter?:number)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store',...(retryAfter?{'Retry-After':String(retryAfter)}:{})}});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(request.method!=='POST')return response({error:'Method not allowed.'},405);
  let body:Record<string,unknown>;
  try{body=await bodyOf(request);}catch{return response({error:'Invalid verification request.'},400);}
  if(body.action!=='send'&&body.action!=='verify')return response({error:'Invalid verification request.'},400);
  if(body.action==='verify'&&(typeof body.challengeId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.challengeId)
   ||typeof body.code!=='string'||!/^\d{6,10}$/.test(body.code)))return response({error:invalid},400);
  const authorization=request.headers.get('Authorization');if(!authorization?.startsWith('Bearer '))return response({error:'Sign in to verify your email.'},401);
  // Request-bound clients and a timeout bound external calls; no payload or Auth
  // error objects are logged because they can contain addresses or session data.
  const signal=AbortSignal.any([request.signal,AbortSignal.timeout(15_000)]);
  try{
   const user=await deps.authenticate(authorization,signal);if(!user)return response({error:'Sign in to verify your email.'},401);
   const service=deps.createServiceClient(signal);
   if(body.action==='send'){
    const {data,error}=await service.rpc('mailbox_begin',{p_user_id:user.id});
    if(error||!object(data))return response({error:unavailable},503);
    if(data.allowed!==true)return response({error:'Please wait before requesting another code.'},429,typeof data.retryAfter==='number'?data.retryAfter:60);
    if(typeof data.email!=='string'||typeof data.challengeId!=='string')return response({error:unavailable},503);
    let delivered=false;
    try{delivered=!(await deps.createOtpClient(signal).auth.signInWithOtp({email:data.email,options:{shouldCreateUser:false}})).error;}catch{delivered=false;}
    const result=await service.rpc('mailbox_send_result',{p_user_id:user.id,p_challenge_id:data.challengeId,p_delivered:delivered});
    if(!delivered||result.error||result.data!==true)return response({error:unavailable},503);
    return response({challengeId:data.challengeId,retryAfter:60},200);
   }
   const {data,error}=await service.rpc('mailbox_attempt',{p_user_id:user.id,p_challenge_id:body.challengeId});
   if(error)return response({error:unavailable},503);
   if(!object(data)||data.allowed!==true||typeof data.email!=='string')return response({error:invalid},400);
   const otp=deps.createOtpClient(signal);
   const verified=await otp.auth.verifyOtp({email:data.email,token:body.code as string,type:'email'});
   // Always revoke the distinct temporary session, including wrong-identity
   // evidence. Never setSession on the original quest client or return tokens.
   if(verified.data.session){const cleanup=await otp.auth.signOut({scope:'local'});if(cleanup.error)return response({error:unavailable},503);}
   const evidence=verified.data.user;
   if(verified.error||!verified.data.session||!evidence||evidence.id!==user.id||evidence.email?.trim().toLowerCase()!==data.email)return response({error:invalid},400);
   const finish=await service.rpc('mailbox_finish',{p_user_id:user.id,p_challenge_id:body.challengeId,p_evidence_user_id:evidence.id,p_evidence_email:evidence.email});
   if(finish.error)return response({error:unavailable},503);
   if(finish.data!==true)return response({error:invalid},400);
   return response({verified:true},200);
  }catch{return response({error:unavailable},503);}
 };
}
