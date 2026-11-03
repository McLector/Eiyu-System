// Disposable local GoTrue/Mailpit protocol test. Never use a hosted target.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createMailboxHandler } from '../backend/supabase/functions/mailbox-verification/mailbox-core.ts';
const workdir='.superpowers/s02-age';
assert.match(readFileSync(`${workdir}/supabase/config.toml`,'utf8'),/project_id = "eiyu-s02-age-demo"/);
const status=JSON.parse(execFileSync('node_modules/@supabase/cli-windows-x64/bin/supabase.exe',
 ['--agent','no','--workdir',workdir,'status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.equal(status.API_URL,'http://127.0.0.1:57321');
assert.equal(new URL(status.MAILPIT_URL).hostname,'127.0.0.1');assert.equal(new URL(status.MAILPIT_URL).port,'57324');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,options);
const client=()=>createClient(status.API_URL,status.ANON_KEY,options);
const ok=(result,label)=>assert.equal(Boolean(result.error),false,label);
const handler=createMailboxHandler({
 authenticate:async authorization=>{const scoped=createClient(status.API_URL,status.ANON_KEY,{...options,global:{headers:{Authorization:authorization}}});const {data,error}=await scoped.auth.getUser();return error?null:data.user;},
 createServiceClient:()=>admin,createOtpClient:client,
});
async function capturedCode(email){
 for(let i=0;i<40;i++){
  const list=await (await fetch(`${status.MAILPIT_URL}/api/v1/messages`)).json();
  const item=list.messages?.find(m=>m.To?.some(to=>to.Address===email));
  if(item){const message=await(await fetch(`${status.MAILPIT_URL}/api/v1/message/${item.ID}`)).json();const match=`${message.Text} ${message.HTML}`.match(/EIYU verification code:\s*([0-9]{6,10})/);assert.equal(Boolean(match),true,'local template contains a typed OTP');return match[1];}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.fail('local verification email was not captured');
}
test('S02 real local OTP proof preserves the quest session and invalidates permanently on email ABA',async t=>{
 const account=client(),email=`s02-${crypto.randomUUID()}@example.test`;
 const signup=await account.auth.signUp({email,password:crypto.randomUUID()+'!aA7',options:{data:{birth_date:'2000-01-01',display_name:'Local mailbox test',time_zone:'UTC'}}});
 ok(signup,'local signup');assert.equal(Boolean(signup.data.session),true,'unproved signup has a quest session');
 const userId=signup.data.user.id,original=signup.data.session.access_token;
 const invoke=body=>handler(new Request('http://local.test/mailbox',{method:'POST',headers:{Authorization:`Bearer ${original}`},body:JSON.stringify(body)}));
 try{
  await t.test('auto-confirmed account has no proof and can still use quests',async()=>{
   assert.equal(Boolean(signup.data.user.email_confirmed_at),true,'Auth timestamp exists');
   const proof=await account.rpc('get_mailbox_status');ok(proof,'self status');assert.equal(proof.data.verified,false);
   const habit=await account.from('habits').insert({user_id:userId,name:'Mailbox-free quest',easy_version:'Read a line',stat:'INT',days:[0,1,2,3,4,5,6]}).select('id').single();ok(habit,'unverified creates quest');
   const date=new Date().toISOString().slice(0,10);
   ok(await account.rpc('get_habits_for_date',{p_date:date}),'materialize existing quest opportunity');
   ok(await account.rpc('complete_habit',{p_habit_id:habit.data.id,p_completed_on:date,p_kind:'full'}),'unverified completes quest');
   const summary=await account.from('weekly_summaries').select('summary');ok(summary,'summary read denied by RLS');assert.equal(summary.data.length,0);
  });
  const sent=await invoke({action:'send',email:'forged@example.test'});assert.equal(sent.status,200,'server sends to current address');const challenge=await sent.json();
  const code=await capturedCode(email);
  await t.test('wrong code and resend cooldown do not grant proof',async()=>{
   const wrong=code==='000000'?'999999':'000000';assert.equal((await invoke({action:'verify',challengeId:challenge.challengeId,code:wrong})).status,400);
   assert.equal((await invoke({action:'send'})).status,429,'server resend throttle');assert.equal((await account.rpc('get_mailbox_status')).data.verified,false);
  });
  await t.test('typed captured OTP commits proof after temporary session cleanup',async()=>{
   const verified=await invoke({action:'verify',challengeId:challenge.challengeId,code});assert.equal(verified.status,200,'typed code verified');
   const responseText=await verified.text();assert.equal(responseText.includes('access_token'),false,'no session returned');assert.equal((await account.rpc('get_mailbox_status')).data.verified,true);
   ok(await account.auth.getUser(),'original session remains valid');assert.equal((await account.auth.getUser()).data.user.id,userId);
   assert.equal(Boolean((await account.auth.getSession()).data.session.access_token===original),true,'original session was never replaced');
   ok(await account.auth.refreshSession(),'original quest refresh token remains valid after temporary session cleanup');
   assert.equal((await invoke({action:'verify',challengeId:challenge.challengeId,code})).status,400,'challenge replay denied');
  });
  await t.test('email change and return invalidate proof despite stale session claims',async()=>{
   ok(await admin.auth.admin.updateUserById(userId,{email:`s02-changed-${crypto.randomUUID()}@example.test`}), 'email changes');
   ok(await admin.auth.admin.updateUserById(userId,{email}), 'email returns');
   const proof=await account.rpc('get_mailbox_status');ok(proof,'status with old JWT');assert.equal(proof.data.verified,false);assert.equal(proof.data.version,3);
   ok(await account.rpc('get_habits_for_date',{p_date:new Date().toISOString().slice(0,10)}),'quests survive proof loss');
  });
 }finally{ok(await admin.auth.admin.deleteUser(userId),'synthetic account cleanup');await account.auth.signOut({scope:'local'});}
});
