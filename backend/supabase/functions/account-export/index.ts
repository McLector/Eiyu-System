import {createClient} from 'jsr:@supabase/supabase-js@2.112.4';
import {authenticateExportBearer} from './export-auth.ts';
import {createOwnerExportHandler} from './export-core.ts';
function env(name:string){const value=Deno.env.get(name);if(!value)throw Error('Account export configuration unavailable.');return value;}
function client(key:string,signal:AbortSignal){
 return createClient(env('SUPABASE_URL'),env(key),{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:(input,init)=>fetch(input,{...init,signal,credentials:'omit'})},
 });
}
const handler=createOwnerExportHandler({
 authenticate:(authorization,signal)=>authenticateExportBearer(authorization,async token=>{
  const {data,error}=await client('SUPABASE_ANON_KEY',signal).auth.getUser(token);
  return error||!data.user?null:{id:data.user.id};
 },signal),
 createServiceClient:signal=>client('SUPABASE_SERVICE_ROLE_KEY',signal),
 corsHeaders:origin=>{
  const headers:Record<string,string>={'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  if(origin&&(['http://localhost:8081','http://localhost:19006','http://localhost:5173','https://eiyu-system.vercel.app'].includes(origin)
   ||/^https:\/\/eiyu-system-[a-z0-9-]+-myres-projects\.vercel\.app$/.test(origin)))headers['Access-Control-Allow-Origin']=origin;
  return headers;
 },
});
// Source only. Retain JWT verification in any separately authorized serving config.
Deno.serve(handler);
