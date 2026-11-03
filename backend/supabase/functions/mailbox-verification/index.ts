import { createClient } from 'jsr:@supabase/supabase-js@2.112.4';
import { createMailboxHandler } from './mailbox-core.ts';
function env(name:string){const value=Deno.env.get(name);if(!value)throw Error('Email verification configuration missing');return value;}
function client(key:string,signal:AbortSignal,authorization?:string){
 return createClient(env('SUPABASE_URL'),env(key),{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{...(authorization?{headers:{Authorization:authorization}}:{}),fetch:(input,init)=>fetch(input,{...init,signal})},
 });
}
const handler=createMailboxHandler({
 authenticate:async(authorization,signal)=>{const {data,error}=await client('SUPABASE_ANON_KEY',signal,authorization).auth.getUser();return error?null:data.user;},
 createServiceClient:signal=>client('SUPABASE_SERVICE_ROLE_KEY',signal),
 createOtpClient:signal=>client('SUPABASE_ANON_KEY',signal),
 corsHeaders:origin=>{
  const headers:Record<string,string>={'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  if(origin&&(['http://localhost:8081','http://localhost:19006','http://localhost:5173','https://eiyu-system.vercel.app'].includes(origin)
   ||/^https:\/\/eiyu-system-[a-z0-9-]+-myres-projects\.vercel\.app$/.test(origin)))headers['Access-Control-Allow-Origin']=origin;
  return headers;
 },
});
Deno.serve(handler);
