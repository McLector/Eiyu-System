/* Synthetic API fixtures only. Real SQL is verified separately; no remote writes. */
const { chromium } = require('../.temp/plan-011/browser/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const OUT = path.resolve('.temp/plan-012/browser-evidence');
const WEB = 'http://127.0.0.1:5176';
const uid = '12000000-0000-4000-8000-000000000001';
const rid = '12000000-0000-4000-8000-000000000002';
const date = '2026-10-01T12:00:00Z';
const TODAY = new Date().toISOString().slice(0, 10);
const tables = {
  profiles: [{ user_id: uid, display_name: 'Layout Hero', user_class: 'Ranger', time_zone: 'UTC' }],
  stats: ['STR','DEX','CHA','INT','WIS'].map(stat => ({user_id:uid,stat,xp:stat === 'INT' ? 90 : 0})),
  habits: [], habit_completions: [], habit_occurrences: [], habit_progress: [],
  weekly_summaries: [{user_id:uid,week_start:new Date().toISOString().slice(0,10),summary:'Steady training and thoughtful preparation kept the journey moving.'}],
  long_quests: Array.from({length:5},(_,i) => ({id:'quest-'+i,user_id:uid,name:i ? 'Expedition '+(i+1) : 'The crystal vault',stat:i ? 'WIS' : 'INT',description:'A journey across the old kingdom.',completed_at:null,created_at:date})),
  long_quest_stages: [],
  gym_routines: [{id:rid,user_id:uid,name:'Upper body',unit:'kg',archived:false,deleted_at:null,created_at:date}, {id:'deleted-routine',user_id:uid,name:'Retired routine',unit:'lb',archived:false,deleted_at:date,created_at:date}],
  gym_exercises: [], gym_sessions: [], gym_entries: [],
};
for(let q=0;q<5;q++) for(let i=0;i<(q ? 2 : 7);i++) tables.long_quest_stages.push({id:`stage-${q}-${i}`,long_quest_id:'quest-'+q,user_id:uid,name:['Find the gate','Cross the bridge','Enter the cave','Explore the mine','Reach the ruins','Open the vault','Return home'][i],done:false,position:i,description:'Prepare your equipment.\nKeep your companions close.'});
for(let i=0;i<12;i++) tables.habits.push({id:'habit-'+i,user_id:uid,name:'Training activity '+(i+1),stat:'STR',difficulty:'Medium',easy_version:'One minute',description:'Move with attention and rest between efforts.',quest_type:'habit',archived:false,reminder_time:'07:00:00',days:[0,1,2,3,4,5,6],target_count:null,created_at:date});
tables.habits.push(
  {id:'one-0',user_id:uid,name:'Pay rent',stat:'WIS',difficulty:'Easy',easy_version:null,description:'Due this week.',quest_type:'one_time',archived:false,reminder_time:'08:00:00',days:[],target_count:null,scheduled_date:TODAY,genre:'todo',time_set:false,created_at:date},
  {id:'idea-0',user_id:uid,name:'Try Obsidian',stat:'INT',difficulty:'Easy',easy_version:null,description:'A note app to try.',quest_type:'backlog',archived:false,reminder_time:'08:00:00',days:[],target_count:null,scheduled_date:null,genre:'tool',time_set:false,created_at:date},
);
for(let i=0;i<8;i++) tables.gym_exercises.push({id:'exercise-'+i,routine_id:rid,user_id:uid,name:['Bench press','Rows','Overhead press','Lat pulldown','Lateral raise','Tricep extension','Curls','Face pull'][i],sets:3,reps:'6-10',rest_seconds:150,rir:1,rir_max:2,notes:i===0?'Use a controlled tempo. Keep feet firmly on the ground.':null,position:i,media_path:i===0?'synthetic-demo.mp4':null,media_mime:i===0?'video/mp4':null,created_at:date});
tables.gym_sessions.push({id:'history',routine_id:'deleted-routine',user_id:uid,routine_name:'Retired routine',unit:'lb',status:'completed',started_at:date,completed_at:date,created_at:date});
tables.gym_entries.push({id:'history-entry',session_id:'history',routine_id:'deleted-routine',user_id:uid,exercise_id:'old-exercise',position:0,weight:45,prescription:{name:'Old press',sets:3,reps:'10',rest_seconds:90,rir:2,notes:null},created_at:date});
const failures = { save: false, remove: false };
const BASE = structuredClone(tables);
function rowsFor(url) {
  let rows = [...(tables[url.pathname.split('/').at(-1)] || [])];
  for(const [key,value] of url.searchParams) {
    if(value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === value.slice(3));
    if(value.startsWith('in.')) { const ids = value.slice(4,-1).split(','); rows = rows.filter(row => ids.includes(String(row[key]))); }
  }
  // PostgREST caps every response at max_rows (1,000 here) even when the client asks for more or sends no limit.
  const offset=+(url.searchParams.get('offset') || 0), limit=Math.min(1000,+(url.searchParams.get('limit') || 1000));
  return rows.slice(offset,offset+limit);
}
async function fixture(route) {
  const request=route.request(), url=new URL(request.url()), operation=url.pathname.split('/').at(-1);
  const input=request.postDataJSON() || {};
  let data;
  if(url.pathname.includes('/storage/v1/object/sign/') && request.method()==='GET') {
    await route.fulfill({status:200,contentType:'video/mp4',body:fs.readFileSync('.temp/plan-012/demonstration.mp4')}); return;
  }
  if(url.pathname.includes('/storage/v1/object/sign')) {
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({signedURL:'/object/sign/fixture?token=synthetic'})}); return;
  }
  if(url.pathname.includes('/rpc/')) {
    if(operation === 'initialize_account_time_zone') data='UTC';
    else if(operation === 'update_profile') { Object.assign(tables.profiles[0],{display_name:input.p_display_name,user_class:input.p_user_class}); data={displayName:input.p_display_name,userClass:input.p_user_class,timeZone:'UTC'}; }
    else if(operation === 'get_habits_for_date') { const offset=+(url.searchParams.get('offset') || 0), limit=Math.min(1000,+(url.searchParams.get('limit') || 1000)); data=tables.habits.filter(h=>h.quest_type!=='backlog').slice(offset,offset+limit); }
    else if(operation === 'read_history_range') data={rows:[],habits:[],recurring_totals:{}};
    else if(operation === 'recent_gym_weights') {
      // The two newest logged weights per exercise, newest first: the answer the real database function gives.
      const finished=new Map(tables.gym_sessions.filter(x=>x.status==='completed').map((x,i)=>[x.id,{session:x,order:i}]));
      data=[];
      for(const exercise of tables.gym_exercises.filter(e=>e.routine_id===input.p_routine_id)) {
        tables.gym_entries.filter(entry=>entry.exercise_id===exercise.id && entry.weight!=null && finished.has(entry.session_id))
          .sort((a,b)=>finished.get(b.session_id).order-finished.get(a.session_id).order).slice(0,2)
          .forEach((entry,i)=>data.push({exercise_id:exercise.id,weight:entry.weight,unit:finished.get(entry.session_id).session.unit,logged_at:date,recency:i+1}));
      }
    } else if(operation === 'log_gym_weight') {
      // The log id is the session id, so a retry of a log that already landed adds nothing.
      if(!tables.gym_sessions.some(x=>x.id===input.p_log_id)) {
        const exercise=tables.gym_exercises.find(e=>e.id===input.p_exercise_id), routine=tables.gym_routines.find(r=>r.id===exercise.routine_id);
        tables.gym_sessions.push({id:input.p_log_id,routine_id:routine.id,user_id:uid,routine_name:routine.name,unit:routine.unit,status:'completed',started_at:date,completed_at:date,created_at:date});
        tables.gym_entries.push({id:'log-entry-'+input.p_log_id,session_id:input.p_log_id,exercise_id:exercise.id,user_id:uid,position:exercise.position,weight:input.p_weight,prescription:{...exercise},created_at:date});
      }
      data=null;
    } else if(operation === 'previous_gym_weights') data=tables.gym_exercises.map(e=>({exercise_id:e.id,weight:20,unit:'kg',completed_at:date}));
    else if(operation === 'start_gym_session') {
      data='draft-'+tables.gym_sessions.length; tables.gym_sessions.push({id:data,routine_id:rid,user_id:uid,routine_name:'Upper body',unit:'kg',status:'draft',started_at:date,completed_at:null,created_at:date});
      tables.gym_entries.push(...tables.gym_exercises.map(e=>({id:'entry-'+e.id,session_id:data,exercise_id:e.id,user_id:uid,position:e.position,weight:null,prescription:{...e},created_at:date})));
    } else if(operation === 'save_gym_session') {
      for(const w of input.p_weights) tables.gym_entries.find(e=>e.session_id===input.p_session_id && e.exercise_id===w.exercise_id).weight=w.weight;
      if(input.p_finish) Object.assign(tables.gym_sessions.find(s=>s.id===input.p_session_id),{status:'completed',completed_at:date});
      data=null;
    } else if(operation === 'set_long_quest_stage_done_receipt') {
      const stage=tables.long_quest_stages.find(s=>s.id===input.p_stage_id), before=tables.stats.find(s=>s.stat==='INT').xp;
      stage.done=input.p_done; tables.stats.find(s=>s.stat==='INT').xp+=20;
      data={id:input.p_request_id,stage_id:stage.id,done:stage.done,changed:true,replayed:false,components:[{kind:'stage',stat:'INT',delta:20}],totals:[{stat:'INT',before,after:before+20,delta:20}]};
    } else if(operation === 'save_long_quest_definition') {
      if(failures.save) { await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Fixture save failed',code:'XX000'})}); return; }
      const definition=input.p_input; let quest=tables.long_quests.find(q=>q.id===input.p_id);
      if(!quest) { quest={id:input.p_id,user_id:uid,completed_at:null,created_at:date}; tables.long_quests.push(quest); }
      Object.assign(quest,{name:definition.name,stat:definition.stat,description:definition.description});
      const old=tables.long_quest_stages.filter(s=>s.long_quest_id===quest.id);
      tables.long_quest_stages=tables.long_quest_stages.filter(s=>s.long_quest_id!==quest.id);
      definition.stages.forEach((s,i)=>tables.long_quest_stages.push({id:s.id ?? `stage-new-${quest.id}-${i}`,long_quest_id:quest.id,user_id:uid,name:s.name,done:old.find(o=>o.id===s.id)?.done ?? false,position:i,description:s.description}));
      data=input.p_id;
    } else if(operation === 'discard_gym_session') {
      tables.gym_sessions=tables.gym_sessions.filter(s=>s.id!==input.p_session_id); tables.gym_entries=tables.gym_entries.filter(e=>e.session_id!==input.p_session_id); data=null;
    } else if(operation === 'get_long_quest_definition_receipt') data=null;
    else if(operation === 'move_backlog_to_one_time') { Object.assign(tables.habits.find(h=>h.id===input.p_id),{quest_type:'one_time',scheduled_date:TODAY,time_set:false}); data=null; }
    else if(operation === 'move_one_time_to_backlog') { Object.assign(tables.habits.find(h=>h.id===input.p_id),{quest_type:'backlog',scheduled_date:null,days:[],time_set:false}); data=null; }
    else data=[];
  } else if(request.method()==='DELETE') {
    if(failures.remove) { await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Fixture delete failed',code:'XX000'})}); return; }
    const id=url.searchParams.get('id')?.replace(/^eq\./,'');
    tables.long_quests=tables.long_quests.filter(q=>q.id!==id); tables.long_quest_stages=tables.long_quest_stages.filter(s=>s.long_quest_id!==id);
    await route.fulfill({status:204,body:''}); return;
  } else {
    data=rowsFor(url);
    if(operation==='weekly_summaries') data=tables.weekly_summaries;
    if(request.method()==='PATCH') { const rows=rowsFor(url); rows.forEach(row=>Object.assign(row,input)); data=rows; }
    if(request.headers().accept?.includes('application/vnd.pgrst.object')) data=data[0] || null;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
}
const session={access_token:'synthetic-access-token',refresh_token:'synthetic-refresh-token',expires_at:Math.floor(Date.now()/1000)+86400,expires_in:86400,token_type:'bearer',user:{id:uid,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:date}};
async function prepare(context) { await context.route('http://127.0.0.1:54399/**',fixture); await context.addInitScript(value=>localStorage.setItem('sb-127-auth-token',JSON.stringify(value)),session); }
async function theme(page, dark) {
  await page.getByRole('button',{name:/Layout Hero, Ranger, rank/}).click();
  await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
  const control=page.getByRole('switch',{name:'Dark mode'});
  if((await control.getAttribute('aria-checked')==='true')!==dark) await control.click();
  assert.equal(await page.locator('[data-eiyu-dialog]').last().getAttribute('data-theme'),dark?'dark':'light');
  await page.keyboard.press('Escape');
}
async function surface(page, route) {
  if(route==='board' || route.startsWith('status')) {
    await page.getByRole('link',{name:route==='board'?'BOARD':'STATUS',exact:true}).click();
    if(route==='status-weekly') await page.getByRole('tab',{name:'WEEKLY REVIEW',exact:true}).click();
    if(route==='status-hero' && await page.getByRole('tab',{name:'HERO',exact:true}).isVisible()) await page.getByRole('tab',{name:'HERO',exact:true}).click();
  } else if(['settings','history','profile','archived'].includes(route)) {
    await page.getByRole('button',{name:/Layout Hero, Ranger, rank/}).click();
    await page.getByRole('menuitem',{name:route==='profile'?'Edit details':route==='archived'?'Archived habits':'Settings',exact:true}).click();
    if(route==='history') await page.getByRole('button',{name:'VIEW',exact:true}).click();
  } else {
    await page.getByRole('link',{name:route==='quest-editor'?'BOARD':'GYM PROGRESS',exact:true}).click();
    if(route==='quest-editor') await page.getByRole('region',{name:'Daily Quest',exact:true}).getByRole('button',{name:'ADD QUEST',exact:true}).click();
    else await page.getByRole('button',{name:route==='routine-editor'?'Create routine':'Add exercise',exact:true}).click();
  }
}
async function closeSurface(page,route) {
  if(route==='board' || route.startsWith('status')) return;
  await page.locator('[data-eiyu-dialog] .phase4-close').last().click();
  if(route==='history') { await page.getByRole('dialog',{name:'SETTINGS',exact:true}).waitFor(); await page.getByRole('button',{name:'Close SETTINGS',exact:true}).click(); }
  await page.locator('[data-eiyu-dialog]').waitFor({state:'hidden'});
}
async function screenshot(page,name,report) {
  // A capture taken mid-load proves nothing about the loaded layout, so wait out any "Reading ...…" state and fail if it never clears.
  await page.getByText(/^Reading .*…$/).first().waitFor({state:'hidden',timeout:60000}).catch(()=>{ throw new Error(`still loading when capturing ${name}`); });
  await page.waitForTimeout(320); // entrances run 150-500ms; a capture mid-fade would show a translucent dialog
  await page.evaluate(async()=>{ await Promise.all(['14px Inter','700 18px Rajdhani','12px "JetBrains Mono"'].map(font=>document.fonts.load(font))); await document.fonts.ready; await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); });
  if(name.includes('actual-200-percent')) {
    const capture=await page.context().newCDPSession(page);
    const shot=await capture.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(shot.data,'base64'));
    await capture.detach();
  } else await page.screenshot({path:path.join(OUT,name+'.png'),fullPage:true});
  const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,fonts:document.fonts.check('14px Inter') && document.fonts.check('700 18px Rajdhani') && document.fonts.check('12px "JetBrains Mono"')}));
  assert(metrics.scroll <= metrics.width+1, name+' horizontal overflow');
  assert(metrics.fonts,name+' missing fonts');
  report.measurements.push({name,...metrics});
}
async function edgeAcceptance(browser, report) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await prepare(context);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  let rejectedRefreshes = 0;
  page.on('dialog', async dialog => { assert.equal(dialog.type(), 'beforeunload'); rejectedRefreshes++; await dialog.dismiss(); });
  await context.route('http://127.0.0.1:54399/auth/v1/logout**', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Fixture sign out failed' }) }));
  const loggedBefore = tables.gym_entries.filter(entry => entry.weight === 33).length;
  try {
    await page.goto(WEB+'/gym');
    const weight = page.getByRole('spinbutton', { name: 'Current weight for Bench press in kg' });
    // Chrome only shows a beforeunload prompt after a real user gesture; a click on the field is one.
    await weight.click(); await weight.fill('33');
    // A dismissed native prompt may leave Playwright waiting for a load that will not occur.
    await page.reload({ timeout: 2000 }).catch(error => { assert.match(error.message, /ERR_ABORTED|page\.reload: Timeout/); });
    assert.equal(rejectedRefreshes, 1, 'a typed weight that was never logged must invoke native refresh protection');
    assert.equal(await weight.inputValue(), '33');
    report.flows.push('native dirty refresh dismissal retains entered weight');

    await page.getByRole('button', { name: /Layout Hero, Ranger, rank/ }).click();
    await page.getByRole('menuitem', { name: 'Logout', exact: true }).click();
    await page.getByRole('dialog', { name: 'Unsaved changes', exact: true }).waitFor();
    await screenshot(page, 'edge-dirty-logout', report);
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    assert.equal(await weight.inputValue(), '33');
    await page.getByRole('menuitem', { name: 'Logout', exact: true }).waitFor();
    assert.equal(await page.getByRole('menuitem', { name: 'Logout', exact: true }).evaluate(el => el === document.activeElement), true, 'logout focus restored after cancellation');
    await page.keyboard.press('Escape');
    await weight.focus();
    await page.setViewportSize({ width: 390, height: 420 });
    // List and detail: one weight field (the selected exercise) instead of the old one-per-row table.
    assert.equal(await page.getByRole('spinbutton').count(), 1, 'keyboard-height resize keeps the detail pane weight field');
    assert.equal(await weight.inputValue(), '33');
    assert.equal(await weight.evaluate(el => el === document.activeElement), true);
    await screenshot(page, 'edge-keyboard-height', report);
    report.flows.push('keyboard-height resize keeps the weight field, its value and focus');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /Layout Hero, Ranger, rank/ }).click();
    await page.getByRole('menuitem', { name: 'Logout', exact: true }).click();
    await page.getByRole('button', { name: 'Leave without saving', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Fixture sign out failed' }).waitFor();
    await page.getByRole('textbox', { name: 'Email address' }).waitFor();
    assert.equal(tables.gym_entries.filter(entry => entry.weight === 33).length, loggedBefore, 'a weight that was typed but never logged is not saved after consent to leave');
    await screenshot(page, 'edge-failed-logout', report);
    report.flows.push('dirty logout cancellation restores focus; server sign-out failure survives local sign-out and an unlogged weight is not saved');
  } finally {
    await context.close();
  }
}
const SIZES=[[320,568],[390,844],[768,1024],[1024,768],[1280,720],[1440,900],[1920,1080]];
const LONG_WORD='Ünïcödé–journey ⚔ ';
const longText=(n,seed='')=>(seed+LONG_WORD.repeat(Math.ceil(n/LONG_WORD.length))).slice(0,n);
function loadProfile(name) {
  Object.assign(tables,structuredClone(BASE)); failures.save=false; failures.remove=false;
  if(name==='empty') {
    for(const key of ['habits','long_quests','long_quest_stages','gym_routines','gym_exercises','gym_sessions','gym_entries','weekly_summaries']) tables[key]=[];
  } else if(name==='large') {
    // Quest-0's stages come last, beyond the 1,000-row API ceiling a single unpaged read would return.
    tables.long_quests=Array.from({length:600},(_,i)=>({id:'quest-'+i,user_id:uid,name:i ? 'Expedition '+(i+1) : 'The crystal vault',stat:i ? 'WIS' : 'INT',description:'A journey across the old kingdom.',completed_at:null,created_at:date}));
    tables.long_quest_stages=[];
    for(let q=1;q<600;q++) for(let i=0;i<2;i++) tables.long_quest_stages.push({id:`stage-${q}-${i}`,long_quest_id:'quest-'+q,user_id:uid,name:`Stage ${i+1}`,done:false,position:i,description:null});
    for(let i=0;i<12;i++) tables.long_quest_stages.push({id:`stage-0-${i}`,long_quest_id:'quest-0',user_id:uid,name:`Vault step ${i+1}`,done:false,position:i,description:null});
    { const daily=BASE.habits.filter(h=>h.quest_type==='habit'); tables.habits=Array.from({length:1100},(_,i)=>({...daily[i%daily.length],id:'habit-'+i,name:'Training activity '+(i+1)})); }
    tables.gym_exercises=Array.from({length:1050},(_,i)=>({...BASE.gym_exercises[0],id:'exercise-'+i,name:'Exercise '+(i+1),position:i,media_path:null,media_mime:null,notes:null}));
    tables.gym_sessions=Array.from({length:120},(_,s)=>({id:'history-'+s,routine_id:rid,user_id:uid,routine_name:'Upper body',unit:'kg',status:'completed',started_at:date,completed_at:date,created_at:date}));
    tables.gym_entries=tables.gym_sessions.flatMap((s,si)=>Array.from({length:10},(_,i)=>({id:`h-${si}-${i}`,session_id:s.id,routine_id:rid,user_id:uid,exercise_id:'exercise-'+i,position:i,weight:20+i,prescription:{name:'Exercise '+(i+1),sets:3,reps:'6-10',rest_seconds:150,rir:2,notes:null},created_at:date})));
  } else if(name==='long') {
    tables.long_quests.forEach((q,i)=>{ q.name=longText(80,`Q${i} `); q.description=longText(480); });
    tables.long_quest_stages.forEach(s=>{ s.name=longText(80,s.id+' '); s.description=longText(480); });
    tables.habits.forEach((h,i)=>{ h.name=longText(80,`Habit ${i} `); h.description=longText(480); h.easy_version=longText(80); });
    tables.gym_routines[0].name=longText(80,'Routine ');
    tables.gym_exercises.forEach((e,i)=>{ e.name=longText(80,`Lift ${i} `); e.notes=longText(1000); });
  }
}
// Reports pairs of visible controls whose boxes genuinely overlap; nested pairs are not overlap.
async function overlaps(page) {
  return page.evaluate(()=>{
    const els=[...document.querySelectorAll('.chain-stage-row, .chain-complete, .chain-nav-item, .list-pagination button')].filter(e=>e.getClientRects().length>0); // not offsetParent: a position:fixed control has none
    const box=e=>e.getBoundingClientRect(), out=[];
    if(els.length<8) out.push(`detector saw only ${els.length} controls`);
    for(let i=0;i<els.length;i++) for(let j=i+1;j<els.length;j++) {
      if(els[i].contains(els[j]) || els[j].contains(els[i])) continue;
      const a=box(els[i]), b=box(els[j]);
      const w=Math.min(a.right,b.right)-Math.max(a.left,b.left), h=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
      if(w>1 && h>1) out.push(`${(els[i].getAttribute('aria-label')||els[i].textContent).slice(0,30)} x ${(els[j].getAttribute('aria-label')||els[j].textContent).slice(0,30)} (${Math.round(w)}x${Math.round(h)})`);
    }
    return out;
  });
}
async function openApp(browser, w=1440, h=900) {
  const context=await browser.newContext({viewport:{width:w,height:h}}); await prepare(context);
  const page=await context.newPage(); page.setDefaultTimeout(15000); return {context,page};
}
async function matrix(browser, profile, report) {
  const {context,page}=await openApp(browser); page.on('pageerror',e=>report.errors.push(`[${profile}] ${e.message}`));
  try {
    for(const [route,ready] of [['/longquests',null],['/gym',null],['/board',null],['/status',null]]) {
      await page.goto(WEB+route); await page.getByRole('button',{name:/Layout Hero, Ranger, rank/}).waitFor();
      for(const dark of [true,false]) {
        await theme(page,dark);
        for(const [w,h] of SIZES) { await page.setViewportSize({width:w,height:h}); await screenshot(page,`p-${profile}${route.replace('/','-')}-${w}-${h}-${dark?'dark':'light'}`,report); }
      }
      await page.setViewportSize({width:1440,height:900});
    }
    report.flows.push(`${profile}: four screens x both themes x seven sizes`);
  } finally { await context.close(); }
}
async function guardDialog(page) { return page.getByRole('dialog',{name:'Unsaved changes',exact:true}); }
async function openChain(page,name) {
  const item=page.getByRole('navigation',{name:'Your chains'}).getByRole('button',{name:new RegExp(name)}).first();
  if((await item.getAttribute('aria-current'))!=='true') await item.click();
  return item;
}
async function questFlows(browser, report) {
  loadProfile('representative');
  tables.long_quests.unshift({id:'quest-zero',user_id:uid,name:'Empty journey',stat:'STR',description:null,completed_at:null,created_at:date});
  tables.long_quests.push({id:'quest-solo',user_id:uid,name:'Solo journey',stat:'DEX',description:null,completed_at:null,created_at:date});
  tables.long_quest_stages.push({id:'stage-solo-0',long_quest_id:'quest-solo',user_id:uid,name:'Only step',done:false,position:0,description:'Keep this description.'});
  const {context,page}=await openApp(browser); page.on('pageerror',e=>report.errors.push('[quest flows] '+e.message));
  const pager=page.getByRole('navigation',{name:'Chains pages'});
  try {
    await page.goto(WEB+'/longquests');
    // Zero-stage repair keeps the quest and gains a stage through the atomic save.
    await openChain(page,'Empty journey'); await page.getByText('This chain has no stages yet. Edit it to add the first one.').waitFor();
    await page.getByRole('button',{name:'EDIT',exact:true}).click();
    await page.getByRole('button',{name:'+ Add stage',exact:true}).click();
    await page.getByPlaceholder('Stage 1...').fill('First waypoint');
    await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();
    await page.locator('.chain-stage-name',{hasText:'First waypoint'}).waitFor();
    assert.equal(tables.long_quest_stages.filter(s=>s.long_quest_id==='quest-zero').length,1);
    report.flows.push('R4 zero-stage repair saves a first stage atomically');
    // Self-test: the detector must report a forced overlap, otherwise a clean result means nothing.
    await page.goto(WEB+'/longquests'); await openChain(page,'The crystal vault');
    const forced=await page.addStyleTag({content:'.chain-stage-row,.chain-complete{position:fixed!important;left:0!important;top:0!important}'});
    assert.ok((await overlaps(page)).length>0,'overlap detector failed to see a forced overlap');
    await forced.evaluate(el=>el.remove());
    for(const [w,h] of [[320,568],[390,844],[768,1024],[1280,720],[1440,900],[1920,1080]]) {
      await page.setViewportSize({width:w,height:h});
      assert.deepEqual(await overlaps(page),[],`control overlap at ${w}x${h}`);
    }
    await page.setViewportSize({width:1440,height:900});
    report.flows.push('Chain: no control overlap at six sizes');
    // Evidence for the HUD framing: the expanded map in both themes at phone and desktop widths.
    for(const dark of [true,false]) {
      await theme(page,dark);
      for(const [w,h] of [[320,568],[390,844],[1440,900]]) { await page.setViewportSize({width:w,height:h}); await screenshot(page,`chain-expanded-${w}-${h}-${dark?'dark':'light'}`,report); }
    }
    await theme(page,true); await page.setViewportSize({width:1440,height:900});
    // The editor is a modal dialog: the list behind it is inert, and a dirty close asks first; Keep editing preserves input.
    const edit=page.getByRole('button',{name:'EDIT',exact:true});
    await edit.click();
    const editor=page.getByRole('dialog',{name:'Edit Long Quest',exact:true});
    await editor.waitFor();
    assert.equal(await page.evaluate(()=>document.querySelector('.long-quests-page')?.closest('[inert]')!==null),true,'page behind the editor is inert');
    const name=editor.getByRole('textbox',{name:'Quest name',exact:true});
    assert.equal(await name.evaluate(el=>el===document.activeElement),true,'name field takes focus on open');
    await name.fill('The crystal vault renamed');
    await page.keyboard.press('Escape');
    await (await guardDialog(page)).waitFor();
    await page.getByRole('button',{name:'Keep editing',exact:true}).click();
    await (await guardDialog(page)).waitFor({state:'hidden'});
    assert.equal(await name.inputValue(),'The crystal vault renamed');
    report.flows.push('R4 dirty editor dialog is guarded; Keep editing retains input');
    await editor.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('button',{name:'Leave without saving',exact:true}).click();
    await editor.waitFor({state:'hidden'});
    assert.match(await pager.getByText(/ \/ /).innerText(),/^1 \//,'list stays on its page after abandoning an edit');
    assert.equal(await edit.evaluate(el=>el===document.activeElement),true,'focus returns to Edit');
    assert.equal(tables.long_quests.find(q=>q.id==='quest-0').name,'The crystal vault','abandoned edit must not save');
    // Single-stage quests stay editable without removal, and keep stage id/description.
    await openChain(page,'The crystal vault');
    const pagesBefore=+(await pager.getByText(/ \/ /).innerText()).split('/')[1];
    for(let i=1;i<pagesBefore;i++) await pager.getByRole('button',{name:'Next Chains page'}).click();
    await openChain(page,'Solo journey');
    await page.getByRole('button',{name:'EDIT',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/Remove stage/}).count(),0);
    await page.getByPlaceholder('Stage 1...').fill('Only step, renamed');
    await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();
    await page.locator('.chain-stage-name',{hasText:'Only step, renamed'}).waitFor();
    await page.getByRole('navigation',{name:'Your chains'}).getByRole('button',{name:/Solo journey/}).getByText('0/1',{exact:true}).waitFor();
    const solo=tables.long_quest_stages.find(s=>s.long_quest_id==='quest-solo');
    assert.equal(solo.id,'stage-solo-0'); assert.equal(solo.description,'Keep this description.'); assert.equal(solo.name,'Only step, renamed');
    report.flows.push('R4 single-stage quest edits without removal and retains stage id and description');
    // Deletion: cancel returns focus; failure keeps the dialog; retry deletes and the page clamps.
    await page.getByRole('button',{name:'DELETE LONG QUEST',exact:true}).click();
    await page.getByRole('dialog',{name:'Delete Long Quest'}).waitFor();
    await page.getByRole('dialog',{name:'Delete Long Quest'}).getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('dialog',{name:'Delete Long Quest'}).waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'DELETE LONG QUEST','focus returns to the opener');
    failures.remove=true;
    await page.getByRole('button',{name:'DELETE LONG QUEST',exact:true}).click();
    await page.getByRole('dialog',{name:'Delete Long Quest'}).getByRole('button',{name:'Delete Long Quest',exact:true}).click();
    await page.getByRole('dialog',{name:'Delete Long Quest'}).getByRole('alert').waitFor();
    assert.ok(tables.long_quests.some(q=>q.id==='quest-solo'),'failed delete must not remove the quest');
    failures.remove=false;
    await page.getByRole('dialog',{name:'Delete Long Quest'}).getByRole('button',{name:'Delete Long Quest',exact:true}).click();
    await page.getByRole('dialog',{name:'Delete Long Quest'}).waitFor({state:'hidden'});
    await page.getByText('Solo journey').first().waitFor({state:'detached'});
    // The chain list drops its pager once everything fits on one page.
    const pagesAfter=(await pager.count())?+(await pager.getByText(/ \/ /).innerText()).split('/')[1]:1;
    assert.ok(pagesAfter<=pagesBefore,'page count must not grow after deletion');
    if(pagesAfter>1) assert.match(await pager.getByText(/ \/ /).innerText(),new RegExp(`^${pagesAfter} / ${pagesAfter}$`),'page clamps to the last page');
    // The deleted chain was the selected one, so the page falls back to the first chain instead of going blank.
    await page.getByRole('heading',{name:'Empty journey'}).waitFor();
    assert.equal(await page.getByRole('navigation',{name:'Your chains'}).getByRole('button',{name:/Empty journey/}).getAttribute('aria-current'),'true');
    report.flows.push('R4 deletion cancel restores focus, failure keeps dialog, retry deletes and page clamps');
    await page.goto(WEB+'/longquests'); await openChain(page,'The crystal vault');
    await page.getByRole('button',{name:'COMPLETE STAGE',exact:true}).click();
    await page.locator('.chain-stage.is-done').first().waitFor();
    await page.locator('.chain-stage.is-done').first().getByRole('button',{name:/^Actions for /}).click(); await page.getByRole('menuitem',{name:'Mark not done'}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.chain-stage.is-done').length===0);
    report.flows.push('Chain: stage completes and undoes; Done and Current chips follow');
  } finally { await context.close(); }
}
async function gymFlows(browser, report) {
  loadProfile('representative');
  tables.gym_routines.push({id:'routine-lower',user_id:uid,name:'Lower body',unit:'kg',archived:false,deleted_at:null,created_at:date});
  tables.gym_exercises.push({id:'lower-0',routine_id:'routine-lower',user_id:uid,name:'Squat',sets:3,reps:'5',rest_seconds:180,rir:2,rir_max:null,notes:null,position:0,media_path:null,media_mime:null,created_at:date});
  const {context,page}=await openApp(browser); page.on('pageerror',e=>report.errors.push('[gym flows] '+e.message));
  let gymReads=0; page.on('request',r=>{ if(r.url().includes('/rest/v1/gym_')) gymReads++; });
  await page.clock.install();
  try {
    await page.goto(WEB+'/gym');
    const weight=page.getByRole('spinbutton',{name:'Current weight for Bench press in kg'});
    await weight.fill('25');
    // Routine switch with a typed, unlogged weight is guarded; Keep editing preserves selection and input.
    const select=page.locator('.gym-toolbar select');
    await select.selectOption('routine-lower');
    await (await guardDialog(page)).waitFor();
    await page.getByRole('button',{name:'Keep editing',exact:true}).click();
    assert.equal(await select.inputValue(),rid); assert.equal(await weight.inputValue(),'25');
    report.flows.push('R4 routine switch with an unlogged weight is guarded and retains input');
    // Background refresh must not clobber typing.
    // Queries are fresh for 60s, so move the page clock past that, change data server-side, and require a real refetch.
    const before=gymReads;
    tables.gym_routines[0].name='Upper body (refreshed)';
    await weight.focus(); await page.clock.setSystemTime(Date.now()+5*60_000);
    await page.evaluate(()=>{ window.dispatchEvent(new Event('visibilitychange')); });
    await page.getByRole('heading',{name:/Upper body \(refreshed\)/}).waitFor();
    assert.ok(gymReads-before>0,'background refresh must actually run'); report.refreshRequestsObserved=gymReads-before;
    assert.equal(await weight.inputValue(),'25'); assert.equal(await weight.evaluate(el=>el===document.activeElement),true);
    report.flows.push(`R4 background refresh applied new data while typing retained input and focus (${gymReads-before} refresh requests)`);
    // There is no draft snapshot to protect, so definitions stay editable; clear the field so the next flow starts clean.
    assert.equal(await page.getByRole('button',{name:/^Exercise actions for /}).isDisabled(),false);
    await weight.fill('');
    report.flows.push('R4 exercise definitions stay editable: no draft snapshot exists');
    // Clearing a numeric prescription must stay blank, never coerce to zero, and block saving.
    await page.getByRole('button',{name:/^Exercise actions for /}).click();
    await page.getByRole('menuitem',{name:'Edit exercise'}).click();
    const sets=page.getByLabel('Sets',{exact:true});
    await sets.fill(''); await sets.blur();
    assert.equal(await sets.inputValue(),'');
    await page.getByRole('button',{name:'Save exercise',exact:true}).click();
    assert.equal(await page.getByRole('dialog').count(),1,'invalid blank sets must keep the editor open');
    assert.equal(tables.gym_exercises[0].sets,3);
    report.flows.push('R4 cleared Sets stays blank (not zero) and blocks save');
    await page.keyboard.press('Escape');
    if(await (await guardDialog(page)).isVisible()) await page.getByRole('button',{name:'Leave without saving',exact:true}).click();
    await page.locator('[data-eiyu-dialog]').waitFor({state:'hidden'});
    for(const [w,h] of VIEWPORTS) {
      await page.setViewportSize({width:w,height:h});
      await page.getByRole('button',{name:'Create routine',exact:true}).click();
      await page.getByRole('dialog',{name:'Create routine'}).waitFor();
      await assertFits(page,`create routine ${w}x${h}`);
      await page.keyboard.press('Escape'); await page.locator('[data-eiyu-dialog]').waitFor({state:'hidden'});
      await page.getByRole('button',{name:'Add exercise',exact:true}).click();
      await page.getByRole('dialog',{name:'Add exercise'}).waitFor();
      await assertFits(page,`add exercise ${w}x${h}`);
      await page.keyboard.press('Escape'); await page.locator('[data-eiyu-dialog]').waitFor({state:'hidden'});
    }
    await page.setViewportSize({width:1440,height:900});
    report.flows.push('gym: routine and exercise dialogs fit at three viewports');
  } finally { await context.close(); }
}
async function profileAcceptance(browser, profile, report) {
  loadProfile(profile);
  await matrix(browser,profile,report);
  const {context,page}=await openApp(browser); page.on('pageerror',e=>report.errors.push(`[${profile}] ${e.message}`));
  try {
    await page.goto(WEB+'/longquests');
    if(profile==='empty') {
      await page.getByText('NO LONG QUESTS').waitFor();
      await page.goto(WEB+'/gym'); await page.getByText('No routine yet. Create one, then add its exercises.').waitFor();
      report.flows.push('R5 empty account shows Long Quest and Gym empty states');
    }
    if(profile==='large') {
      const pages=Math.ceil(tables.long_quests.length/6); // the chain list shows six per page at this width
      await page.getByText(new RegExp(`^1 / ${pages}$`)).waitFor();
      await page.getByRole('navigation',{name:'Your chains'}).getByText('0/12',{exact:true}).waitFor();
      report.flows.push(`R5 large catalog: ${tables.long_quests.length} quests paged ${pages}x; quest-0 keeps all 12 stages whose rows sit past the 1,000-row ceiling`);
      await page.goto(WEB+'/gym'); await page.getByRole('spinbutton',{name:'Current weight for Exercise 1 in kg'}).waitFor();
      const gymPages=Math.ceil(tables.gym_exercises.length/8);
      await page.getByText(new RegExp(`^1 / ${gymPages}$`)).waitFor();
      report.flows.push(`R5 large Gym routine: ${tables.gym_exercises.length} exercises paged ${gymPages}x`);
      // The Board reads habits in bounded batches, so a 1,100-habit catalog must not be cut off at the 1,000-row API cap.
      await page.goto(WEB+'/board'); await page.getByRole('region',{name:'Daily Quest'}).getByText(`${tables.habits.length} items`,{exact:true}).waitFor();
      report.flows.push(`R5 large Board: all ${tables.habits.length} habits shown, none cut off at the API cap`);
    }
    if(profile==='long') {
      await openChain(page,'Q0 ');
      assert.deepEqual(await overlaps(page),[],'long names must not overlap controls');
      await page.goto(WEB+'/gym');
      await page.getByRole('button',{name:/Ünïcödé/}).first().waitFor();
      await page.locator('.gym-list-item').first().click(); assert.ok((await page.locator('.gym-detail .details-note').innerText()).length>=900,'full note is visible, not truncated');
      assert.equal(await page.locator('.gym-detail .details-note').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'note does not overflow horizontally');
      report.flows.push('R5 long Unicode names, descriptions and a 1,000-character note stay reachable without overlap');
    }
  } finally { await context.close(); }
}
// Actual browser zoom (not a CSS trick): Chrome's persisted zoom level gives a ~640px layout viewport at DPR 2.
async function zoomAcceptance(profile, report) {
  loadProfile(profile);
  const dir=path.join(OUT,`zoom-profile-${profile}`); fs.mkdirSync(path.join(dir,'Default'),{recursive:true});
  fs.writeFileSync(path.join(dir,'Default','Preferences'),JSON.stringify({partition:{default_zoom_level:{x:Math.log(2)/Math.log(1.2)}}}));
  const context=await chromium.launchPersistentContext(dir,{channel:'chrome',headless:true,viewport:null,args:['--window-size=1280,900']}); await prepare(context);
  try {
    const page=await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror',e=>report.errors.push(`[zoom ${profile}] ${e.message}`));
    for(const route of ['/longquests','/gym','/board','/status']) {
      await page.goto(WEB+route); await page.getByRole('button',{name:/Layout Hero, Ranger, rank/}).waitFor();
      const size=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio})); assert(size.width<=640 && size.dpr>=2,`zoom not applied: ${JSON.stringify(size)}`);
      for(const dark of [true,false]) { await theme(page,dark); await screenshot(page,`zoom-${profile}${route.replace('/','-')}-${dark?'dark':'light'}-actual-200-percent`,report); }
    }
    report.flows.push(`${profile}: actual 200% zoom, four screens x both themes, no horizontal overflow`);
  } finally { await context.close(); }
}
async function keyboardAcceptance(browser, report) {
  loadProfile('representative');
  const {context,page}=await openApp(browser); page.on('pageerror',e=>report.errors.push('[keyboard] '+e.message));
  try {
    await page.goto(WEB+'/board');
    const trigger=page.getByRole('button',{name:/Layout Hero, Ranger, rank/});
    await trigger.focus(); await page.keyboard.press('Enter');
    const items=page.getByRole('menuitem'); await items.first().waitFor();
    const total=await items.count();
    const activeIndex=()=>page.evaluate(()=>[...document.querySelectorAll('[role=menuitem]')].indexOf(document.activeElement));
    await page.keyboard.press('End'); assert.equal(await activeIndex(),total-1);
    await page.keyboard.press('Home'); assert.equal(await activeIndex(),0);
    await page.keyboard.press('ArrowDown'); assert.equal(await activeIndex(),1);
    await page.keyboard.press('ArrowUp'); assert.equal(await activeIndex(),0);
    await page.keyboard.press('Escape'); await items.first().waitFor({state:'hidden'});
    assert.equal(await trigger.evaluate(el=>el===document.activeElement),true,'Escape restores focus to the account button');
    report.flows.push('R5 account menu: arrows, Home/End, Escape and focus restoration');
    // Nested confirmation: Escape closes only the topmost dialog and restores focus beneath it.
    await page.goto(WEB+'/gym');
    await page.getByRole('button',{name:/^Routine actions for /}).click();
    await page.getByRole('menuitem',{name:'Delete routine'}).click();
    await page.getByRole('dialog',{name:'Delete routine'}).waitFor();
    await page.keyboard.press('Escape'); await page.getByRole('dialog',{name:'Delete routine'}).waitFor({state:'hidden'});
    assert.match(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),/^Routine actions for /);
    report.flows.push('R5 confirmation dialog: Escape closes it and focus returns to the menu that opened it');
    // Cursors: native text cursor in fields, plain pointer on buttons, no custom cursor image.
    await page.getByRole('button',{name:'Create routine',exact:true}).click();
    const cursors=await page.evaluate(()=>{
      const css=e=>getComputedStyle(e).cursor;
      const input=document.querySelector('[data-eiyu-dialog] input[type=text], [data-eiyu-dialog] input:not([type])');
      return {text:input?css(input):null,button:css(document.querySelector('[data-eiyu-dialog] button'))};
    });
    assert.equal(cursors.text,'text','text fields keep the native text cursor'); assert.equal(cursors.button,'pointer','buttons use the default pointer'); assert.ok(!/url\(/.test(await page.evaluate(()=>getComputedStyle(document.body).cursor)),'no custom cursor image');
    report.cursors=cursors; report.flows.push('R5 text-field cursor fallback checked');
  } finally { await context.close(); }
}
const VIEWPORTS=[[1366,650],[1280,600],[390,660]];
async function assertFits(page,label) {
  const m=await page.locator('[data-eiyu-dialog] .compact-dialog-body').last().evaluate(el=>({sh:el.scrollHeight,ch:el.clientHeight}));
  assert.ok(m.sh<=m.ch+1,`${label}: dialog body scrolls (${m.sh} > ${m.ch})`);
}
async function boardFlows(browser, report) {
  loadProfile('representative');
  for(let i=0;i<4;i++) tables.habits.push({...BASE.habits[0],id:'retired-'+i,name:'Retired habit '+(i+1),archived:true});
  const {context,page}=await openApp(browser); page.on('pageerror',e=>report.errors.push('[board flows] '+e.message));
  const lane=name=>page.getByRole('region',{name,exact:true});
  try {
    await page.goto(WEB+'/board'); await lane('Backlog').getByText('Try Obsidian').waitFor();
    // Four compact cards fit a Daily lane at the two laptop viewports.
    for(const [w,h] of VIEWPORTS.slice(0,2)) {
      await page.setViewportSize({width:w,height:h});
      await page.waitForTimeout(250);
      const shown=await lane('Daily Quest').locator('.quest-card').count();
      assert.ok(shown>=4,`Daily lane shows ${shown} cards at ${w}x${h}, expected at least 4`);
      report.cardsPerLane=report.cardsPerLane||{}; report.cardsPerLane[`${w}x${h}`]=shown;
      await screenshot(page,`board-${w}-${h}`,report);
    }
    await page.setViewportSize({width:1440,height:900});
    // Details from the card; Edit Quest from the menu.
    await lane('1-Time Quest').getByRole('button',{name:'View Pay rent details'}).click();
    const details=page.getByRole('dialog',{name:'Quest details'}); await details.waitFor();
    assert.equal(await details.locator('input,textarea,select').count(),0,'details are read-only');
    await assertFits(page,'details dialog');
    await page.keyboard.press('Escape'); await details.waitFor({state:'hidden'});
    // Move by menu, then back by drag.
    await lane('Backlog').getByRole('button',{name:'More actions for Try Obsidian'}).click();
    await page.getByRole('menuitem',{name:'Move Try Obsidian to 1-Time'}).click();
    await lane('1-Time Quest').getByText('Try Obsidian').waitFor();
    assert.equal(tables.habits.find(h=>h.id==='idea-0').quest_type,'one_time');
    await lane('1-Time Quest').locator('[data-testid="quest-card-idea-0"] .quest-card-grip').dragTo(lane('Backlog'));
    await lane('Backlog').getByText('Try Obsidian').waitFor();
    assert.equal(tables.habits.find(h=>h.id==='idea-0').quest_type,'backlog');
    await lane('Backlog').locator('[data-testid="quest-card-idea-0"] .quest-card-grip').dragTo(lane('1-Time Quest'));
    await lane('1-Time Quest').getByText('Try Obsidian').waitFor();
    await lane('1-Time Quest').getByRole('button',{name:'More actions for Try Obsidian'}).click();
    await page.getByRole('menuitem',{name:'Move Try Obsidian to Backlog'}).click();
    await lane('Backlog').getByText('Try Obsidian').waitFor();
    assert.equal(tables.habits.find(h=>h.id==='idea-0').quest_type,'backlog');
    report.flows.push('board: Backlog card moves by menu and by drag in both directions');
    // All Habits is a dialog; the dialogs never scroll at the three gated viewports.
    await lane('Daily Quest').getByRole('button',{name:/ALL HABITS/}).click();
    await page.getByRole('dialog',{name:'All habits'}).waitFor();
    for(const [w,h] of VIEWPORTS) { await page.setViewportSize({width:w,height:h}); await assertFits(page,`All habits ${w}x${h}`); }
    await page.keyboard.press('Escape');
    for(const [w,h] of VIEWPORTS) {
      await page.setViewportSize({width:w,height:h});
      for(const type of ['Habit','1-Time','Backlog']) {
        await page.goto(WEB+'/board');
        await lane('Daily Quest').getByRole('button',{name:'ADD QUEST'}).click();
        await page.getByRole('group',{name:'Quest type'}).getByRole('button',{name:type,exact:true}).click();
        await assertFits(page,`new ${type} quest ${w}x${h}`);
        await screenshot(page,`new-${type.toLowerCase()}-${w}-${h}`,report);
      }
      await page.goto(WEB+'/board');
      await lane('Daily Quest').getByRole('button',{name:/^More actions for Training activity 1$/}).first().click();
      await page.getByRole('menuitem',{name:/^Edit Training activity 1$/}).click();
      await page.getByRole('dialog',{name:'EDIT QUEST'}).waitFor();
      await assertFits(page,`edit habit ${w}x${h}`);
      // Editing keeps every field of a One-time and a Backlog quest too.
      for(const [laneName,quest] of [['1-Time Quest','Pay rent'],['Backlog','Try Obsidian']]) {
        await page.goto(WEB+'/board');
        if(w<1200) await page.getByRole('tab',{name:new RegExp(laneName)}).click();
        await lane(laneName).getByRole('button',{name:`More actions for ${quest}`}).click();
        await page.getByRole('menuitem',{name:`Edit ${quest}`}).click();
        await page.getByRole('dialog',{name:'EDIT QUEST'}).waitFor();
        await assertFits(page,`edit ${laneName} ${w}x${h}`);
      }
      // A confirm dialog and Archived habits.
      await page.goto(WEB+'/board');
      if(w<1200) await page.getByRole('tab',{name:/Daily Quest/}).click();
      await lane('Daily Quest').getByRole('button',{name:/^More actions for Training activity 1$/}).first().click();
      await page.getByRole('menuitem',{name:/^Delete Training activity 1$/}).click();
      await page.getByRole('dialog',{name:/ permanently\?$/}).waitFor();
      await assertFits(page,`delete confirm ${w}x${h}`);
      await page.keyboard.press('Escape');
      await page.getByRole('button',{name:/Layout Hero, Ranger, rank/}).click();
      await page.getByRole('menuitem',{name:'Archived habits',exact:true}).click();
      await page.getByRole('dialog',{name:'Archived habits'}).getByText('Retired habit 1').waitFor();
      await assertFits(page,`archived habits ${w}x${h}`);
      await screenshot(page,`archived-${w}-${h}`,report);
    }
    await page.setViewportSize({width:1440,height:900});
    report.flows.push('board: quest editors (three types, create and edit), details, confirm, Archived habits and All habits fit without scrolling at 1366x650, 1280x600 and 390x660');
  } finally { await context.close(); }
}

// Every palette, chosen in Settings in both themes: the page surface and the dialog agree, the accents differ, the choice survives a reload (dark), and it is reversible.
const PALETTES=[['cyan','Cyan','#67e8f9'],['blue','System blue','#5e9cf0'],['indigo','Indigo','#818cf8'],['violet','Monarch violet','#a78bfa'],['magenta','Magenta','#e879f9'],['steel','Steel','#cbd5e1'],['jade','Jade','#2dd4b0'],['lime','Lime','#a3e635']];
// A signed-out page in a fresh browser is System blue: index.html paints the default before the app loads.
async function signedOutPalette(browser,report) {
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  try {
    const page=await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror',e=>report.errors.push(e.message));
    await page.goto(WEB+'/auth'); await page.waitForLoadState('load');
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.palette),'blue','signed-out page is System blue');
    report.flows.push('signed-out page in a fresh browser is System blue');
  } finally { await context.close(); }
}
async function paletteAcceptance(page,report) {
  const identity=/Layout Hero, Ranger, rank/;
  const openSettings=async()=>{ await page.getByRole('button',{name:identity}).click(); await page.getByRole('menuitem',{name:'Settings'}).click(); await page.getByRole('dialog',{name:'SETTINGS'}).waitFor(); };
  const read=()=>page.evaluate(()=>{ const val=(el,name)=>getComputedStyle(el).getPropertyValue(name).trim(); const dialog=document.querySelector('[role=dialog]'); const surface=document.querySelector('.surface-flat[data-theme]'); return {dialog:val(dialog,'--c-accent'),surface:val(surface,'--c-accent'),body:val(surface,'--c-body'),glow:val(surface,'--c-glow')}; });
  await page.setViewportSize({width:1440,height:900});
  for(const dark of [true,false]) {
    await page.goto(WEB+'/board'); await page.getByRole('button',{name:identity}).waitFor();
    await theme(page,dark);
    const seen=new Set();
    for(const [id,label,swatch] of PALETTES) {
      await openSettings();
      await page.getByRole('radio',{name:label}).check();
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.palette),id==='cyan'?undefined:id);
      const now=await read();
      assert.equal(now.dialog,now.surface,`${id} ${dark?'dark':'light'}: dialog and page agree`);
      if(dark) assert.equal(now.dialog,swatch,`${id} dark accent is its swatch`);
      assert(!seen.has(now.dialog),`${id} ${dark?'dark':'light'} accent is distinct`); seen.add(now.dialog);
      await screenshot(page,`palette-${id}-settings-${dark?'dark':'light'}`,report);
      await page.keyboard.press('Escape');
      if(dark&&id!=='cyan') for(const route of ['board','status','gym']) {
        await page.goto(WEB+'/'+route); await page.getByRole('button',{name:identity}).waitFor();
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.palette),id,`${id} persists across a reload on ${route}`);
        await page.waitForTimeout(400); await screenshot(page,`palette-${id}-${route}`,report);
      }
    }
    assert.equal(seen.size,PALETTES.length);
  }
  report.flows.push('Palettes: all eight chosen in Settings in dark and light, shared by page and dialogs, distinct, persist across reloads, reversible');
}
async function main() {
  fs.mkdirSync(OUT,{recursive:true}); const report={measurements:[],flows:[],errors:[]};
  let browser, zoom;
  try {
    browser=await chromium.launch({channel:'chrome',headless:true});
    if (process.argv.includes('--edge-only')) {
      await edgeAcceptance(browser, report);
      assert.equal(report.errors.length, 0, report.errors.join('\n'));
      fs.writeFileSync(path.join(OUT, 'edge-report.json'), JSON.stringify(report, null, 2));
      console.log('Browser edge acceptance passed:', report.measurements.length, 'screens,', report.flows.length, 'flows.');
      return;
    }
    if (process.argv.includes('--palettes')) {
      await signedOutPalette(browser,report);
      const pc=await browser.newContext({viewport:{width:1440,height:900}}); await prepare(pc);
      const pp=await pc.newPage(); pp.setDefaultTimeout(15000); pp.on('pageerror',e=>report.errors.push(e.message));
      await paletteAcceptance(pp,report); await pc.close();
      assert.equal(report.errors.length,0,report.errors.join('\n'));
      fs.writeFileSync(path.join(OUT,'palettes-report.json'),JSON.stringify(report,null,2));
      console.log('Palette acceptance passed:',report.measurements.length,'screens,',report.flows.length,'flows.');
      return;
    }
    if (process.argv.includes('--profiles')) {
      const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');
      const steps={board:()=>boardFlows(browser,report),quest:()=>questFlows(browser,report),gym:()=>gymFlows(browser,report),keyboard:()=>keyboardAcceptance(browser,report),
        zoom:async()=>{ for(const p of ['empty','large','long']) await zoomAcceptance(p,report); },
        empty:()=>profileAcceptance(browser,'empty',report),large:()=>profileAcceptance(browser,'large',report),long:()=>profileAcceptance(browser,'long',report),representative:()=>profileAcceptance(browser,'representative',report)};
      for(const [key,run] of Object.entries(steps)) if(!only || only.includes(key)) { console.log('running',key); await run(); }
      assert.equal(report.errors.length,0,report.errors.join('\n'));
      fs.writeFileSync(path.join(OUT,'profiles-report.json'),JSON.stringify(report,null,2));
      console.log('Profile acceptance passed:',report.measurements.length,'screens,',report.flows.length,'flows.');
      return;
    }
    const context=await browser.newContext({viewport:{width:1440,height:900}}); await prepare(context);
    const page=await context.newPage(); page.setDefaultTimeout(10000); page.on('pageerror',e=>report.errors.push(e.message));
    await page.goto(WEB+'/longquests'); await page.getByText('The crystal vault',{exact:true}).first().waitFor();
    // Motion: a dialog enters with opacity and transform transitions, and under reduced motion with opacity only.
    for(const reduced of [false,true]) {
      await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
      await page.getByRole('button',{name:/NEW QUEST/}).click();
      const dialog=page.getByRole('dialog',{name:'New Long Quest'}); await dialog.waitFor();
      const running=await dialog.evaluate(el=>el.getAnimations().map(a=>a.transitionProperty).sort());
      assert.deepEqual(running,reduced?['opacity']:['opacity','transform'],`dialog entrance transitions (reduced motion: ${reduced})`);
      await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
    }
    await page.emulateMedia({reducedMotion:'no-preference'});
    report.flows.push('dialog entrance: opacity + transform, opacity only under reduced motion');
    // Slow-motion feel check: at 10% speed the dialog is caught mid-transition (translucent, scaled), then settles cleanly.
    {
      const cdp=await page.context().newCDPSession(page);
      await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate',{playbackRate:0.1});
      await page.getByRole('button',{name:/NEW QUEST/}).click();
      const dialog=page.getByRole('dialog',{name:'New Long Quest'}); await dialog.waitFor();
      await page.waitForTimeout(300);
      const mid=await dialog.evaluate(el=>({opacity:+getComputedStyle(el).opacity,transform:getComputedStyle(el).transform}));
      assert.ok(mid.opacity>0 && mid.opacity<1,`dialog should be translucent mid-entrance, got ${mid.opacity}`);
      assert.notEqual(mid.transform,'none','dialog should be scaled mid-entrance');
      await page.screenshot({path:path.join(OUT,'motion-dialog-mid.png')});
      await cdp.send('Animation.setPlaybackRate',{playbackRate:1}); await page.waitForTimeout(500);
      const settled=await dialog.evaluate(el=>({opacity:+getComputedStyle(el).opacity,transform:getComputedStyle(el).transform}));
      assert.equal(settled.opacity,1); assert.equal(settled.transform,'none','dialog must settle with no leftover transform');
      await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'}); await cdp.detach();
      report.flows.push('slow-motion: dialog is mid-transition at 10% speed and settles to opacity 1, no transform');
    }
    // Board row action menu: stays inside the viewport at phone and desktop widths, themed in light, Escape returns focus.
    {
      await page.goto(WEB+'/board'); await page.getByRole('region',{name:'Daily Quest',exact:true}).waitFor();
      for(const dark of [false,true]) {
        await theme(page,dark);
        for(const [w,h] of [[320,568],[1440,900]]) {
          await page.setViewportSize({width:w,height:h});
          const opener=page.getByRole('region',{name:'Daily Quest',exact:true}).getByRole('button',{name:/^More actions for /}).first();
          await opener.waitFor(); await opener.click();
          const menu=page.getByRole('menu'); await menu.waitFor();
          await page.waitForTimeout(260);
          const probe=await menu.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,bg:s.backgroundColor,color:getComputedStyle(el.querySelector('[role=menuitem]')).color,focusOnItem:document.activeElement?.getAttribute('role')==='menuitem'};});
          assert.equal(probe.inside,true,`menu inside viewport at ${w}x${h}`);
          assert.notEqual(probe.bg,'rgba(0, 0, 0, 0)','menu has a themed background'); assert.equal(probe.focusOnItem,true);
          await screenshot(page,`board-menu-${w}-${h}-${dark?'dark':'light'}`,report);
          await page.keyboard.press('Escape'); await menu.waitFor({state:'hidden'});
          assert.equal(await opener.evaluate(el=>el===document.activeElement),true,`Escape returns focus to the trigger at ${w}x${h} ${dark?'dark':'light'}; focus is on: ${await page.evaluate(()=>document.activeElement?.outerHTML.slice(0,140))}`);
        }
      }
      await page.setViewportSize({width:1440,height:900});
      await page.goto(WEB+'/longquests'); await page.getByText('The crystal vault',{exact:true}).first().waitFor();
      report.flows.push('board row menu: inside viewport at 320 and 1440, themed in both themes, Escape returns focus');
    }
    for(const [w,h] of [[320,568],[390,844],[768,1024],[1024,768],[1280,720],[1440,900],[1920,1080]]) {
      await page.setViewportSize({width:w,height:h});
      for(const dark of [true,false]) {
        await theme(page,dark); await screenshot(page,`quests-${w}-${h}-${dark?'dark':'light'}`,report);
      }
    }
    await page.setViewportSize({width:1440,height:900});
    await openChain(page,'The crystal vault'); await screenshot(page,'quests-expanded',report);
    await page.getByRole('button',{name:'COMPLETE STAGE',exact:true}).click();
    await page.getByRole('status',{name:'Confirmed XP reward'}).waitFor();
    assert.equal(await page.getByText('INT +20 XP',{exact:true}).count(),1);
    await page.locator('.chain-stage.is-done').first().waitFor();
    await screenshot(page,'confirmed-xp',report);
    report.flows.push('confirmed actual XP and checkpoint advancement');
    await page.goto(WEB+'/gym');
    await page.locator('.gym-list-item').first().click();
    await page.waitForFunction(()=>{const v=document.querySelector('video.gym-media');return v && v.readyState>=1;});
    assert(await page.locator('video.gym-media').evaluate(v=>v.muted && v.controls && v.playsInline));
    report.flows.push('video guide is muted, inline and controllable in the detail pane');
    const bench=page.getByRole('spinbutton',{name:'Current weight for Bench press in kg'});
    await bench.fill('20');
    await page.getByRole('button',{name:/Layout Hero, Ranger, rank/}).click(); await page.getByRole('menuitem',{name:'Edit details'}).click();
    await page.getByRole('dialog',{name:'EDIT DETAILS',exact:true}).waitFor();
    await page.getByRole('button',{name:'Close EDIT DETAILS',exact:true}).click();
    await page.getByRole('dialog',{name:'EDIT DETAILS',exact:true}).waitFor({state:'hidden'});
    assert.equal(await bench.inputValue(),'20');
    await page.getByRole('link',{name:'CHAIN PROGRESSION',exact:true}).click(); await page.getByRole('button',{name:'Keep editing',exact:true}).click();
    assert(page.url().includes('/gym'));
    await page.locator('.gym-list-item',{hasText:'Curls'}).click();
    const curls=page.getByRole('spinbutton',{name:'Current weight for Curls in kg'});
    assert.equal(await curls.inputValue(),'');
    // Text the browser cannot read as a number must still be explained, not silently ignored.
    await curls.press('e');
    await page.getByRole('button',{name:'Log weight for Curls',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Enter a valid weight for Curls'}).waitFor();
    await curls.fill('');
    await page.locator('.gym-list-item',{hasText:'Bench press'}).click();
    assert.equal(await bench.inputValue(),'20');
    report.flows.push('dirty Gym overlay preservation, guarded routing, unreadable weight explained');
    // Logging: Enter stores the weight, it survives a refresh, and the next log pushes it into Previous.
    await bench.fill('22.5'); await bench.press('Enter');
    await page.getByRole('status').filter({hasText:'Bench press: 22.5 kg logged.'}).waitFor();
    assert.equal(tables.gym_entries.filter(entry=>entry.weight===22.5).length,1,'one log, exactly once');
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('[aria-label="Current weight for Bench press in kg"]')?.value==='22.5');
    await page.getByRole('spinbutton',{name:'Current weight for Bench press in kg'}).fill('25'); await page.getByRole('button',{name:'Log weight for Bench press',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Bench press: 25 kg logged.'}).waitFor();
    await page.locator('.gym-kv-current').locator('xpath=preceding-sibling::div[1]').getByText('22.5 kg',{exact:true}).waitFor();
    report.flows.push('weight logged with Enter and the arrow, kept after refresh, and the old Current becomes Previous');
    for(const [w,h] of [[320,568],[390,844],[768,1024],[1024,768],[1280,720],[1440,900],[1920,1080]]) {
      await page.setViewportSize({width:w,height:h});
      for(const dark of [true,false]) { await theme(page,dark); await screenshot(page,`gym-${w}-${h}-${dark?'dark':'light'}`,report); }
    }
    await page.getByRole('button',{name:'Workout history',exact:true}).click();
    await page.locator('summary').filter({hasText:'Deleted routine'}).waitFor();
    assert.equal(await page.getByRole('combobox',{name:'Workouts'}).inputValue(),'');
    await screenshot(page,'history-deleted',report); await page.keyboard.press('Escape');
    report.flows.push('all-workout deleted-routine history');
    await signedOutPalette(browser,report);
    await paletteAcceptance(page,report);
    for(const route of ['board','status','status-weekly','status-hero','settings','history','quest-editor','profile','archived','routine-editor','exercise-editor']) {
      await page.goto(WEB+'/board'); await page.getByRole('button',{name:/Layout Hero, Ranger, rank/}).waitFor();
      for(const [w,h] of [[320,568],[390,844],[768,1024],[1024,768],[1280,720],[1440,900],[1920,1080]]) {
        await page.setViewportSize({width:w,height:h});
        for(const dark of [true,false]) {
          await theme(page,dark);
          await surface(page,route);
          await screenshot(page,`${route}-${w}-${h}-${dark?'dark':'light'}`,report);
          await closeSurface(page,route);
        }
      }
    }
    await page.goto(WEB+'/longquests'); await page.getByText('The crystal vault',{exact:true}).first().waitFor();
    assert.equal(await page.locator('.journey').count(),0,'the animated map is gone'); report.flows.push('Chain page has no animated map');
    const profile=path.join(OUT,'zoom-profile'); fs.mkdirSync(path.join(profile,'Default'),{recursive:true});
    fs.writeFileSync(path.join(profile,'Default','Preferences'),JSON.stringify({partition:{default_zoom_level:{x:Math.log(2)/Math.log(1.2)}}}));
    zoom=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:null,args:['--window-size=1280,900']}); await prepare(zoom);
    const zp=await zoom.newPage(); await zp.goto(WEB+'/longquests'); await zp.getByText('The crystal vault',{exact:true}).first().waitFor();
    const size=await zp.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio,scale:visualViewport.scale})); assert(size.width<=640 && size.dpr>=2);
    await screenshot(zp,'quests-actual-200-percent',report); report.zoom=size;
    zp.on('pageerror',e=>report.errors.push(e.message));
    for(const route of ['board','status','settings','history','quest-editor','profile','archived','routine-editor','exercise-editor']) {
      for(const dark of [true,false]) { await theme(zp,dark); await surface(zp,route); await screenshot(zp,`${route}-actual-200-percent-${dark?'dark':'light'}`,report); await closeSurface(zp,route); }
    }
    await edgeAcceptance(browser, report);
    const unauth=await browser.newContext();
    try { const ap=await unauth.newPage(); ap.on('pageerror',e=>report.errors.push(e.message)); await ap.goto(WEB+'/auth'); await ap.getByRole('textbox',{name:'Email address'}).waitFor();
      for(const [w,h] of [[320,568],[390,844],[768,1024],[1024,768],[1280,720],[1440,900],[1920,1080]]) { await ap.setViewportSize({width:w,height:h}); await screenshot(ap,`auth-${w}-${h}-default`,report); }
    } finally { await unauth.close(); }
    assert.equal(report.errors.length,0,report.errors.join('\n'));
    fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2)); console.log('Browser fixture acceptance passed:',report.measurements.length,'screens,',report.flows.length,'flows.');
  } finally { await zoom?.close(); await browser?.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
