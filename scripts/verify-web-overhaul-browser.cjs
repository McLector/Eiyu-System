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
    else if(operation === 'get_habits_for_date') { const offset=+(url.searchParams.get('offset') || 0), limit=Math.min(1000,+(url.searchParams.get('limit') || 1000)); data=tables.habits.slice(offset,offset+limit); }
    else if(operation === 'read_history_range') data={rows:[],habits:[],recurring_totals:{}};
    else if(operation === 'previous_gym_weights') data=tables.gym_exercises.map(e=>({exercise_id:e.id,weight:20,unit:'kg',completed_at:date}));
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
  await page.evaluate(async()=>{ await Promise.all(['14px Inter','700 18px Rajdhani','12px "JetBrains Mono"'].map(font=>document.fonts.load(font))); await document.fonts.ready; await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))); });
  if(name.includes('actual-200-percent')) {
    const capture=await page.context().newCDPSession(page);
    const shot=await capture.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(shot.data,'base64'));
    await capture.detach();
  } else await page.screenshot({path:path.join(OUT,name+'.png'),fullPage:true});
  const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,fonts:document.fonts.check('14px Inter') && document.fonts.check('700 18px Rajdhani') && document.fonts.check('12px "JetBrains Mono"'),images:[...document.querySelectorAll('.journey img')].every(i=>i.complete && i.naturalWidth>0)}));
  assert(metrics.scroll <= metrics.width+1, name+' horizontal overflow');
  assert(metrics.fonts && metrics.images,name+' missing fonts/art');
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
  let draftId;
  try {
    await page.goto(WEB+'/gym');
    await page.getByRole('button', { name: 'Start workout', exact: true }).click();
    draftId = tables.gym_sessions.find(session => session.status === 'draft').id;
    const weight = page.getByRole('spinbutton', { name: 'Current weight for Bench press in kg' });
    await weight.fill('25');
    // A dismissed native prompt may leave Playwright waiting for a load that will not occur.
    await page.reload({ timeout: 2000 }).catch(error => { assert.match(error.message, /ERR_ABORTED|page\.reload: Timeout/); });
    assert.equal(rejectedRefreshes, 1, 'dirty draft must invoke native refresh protection');
    assert.equal(await weight.inputValue(), '25');
    report.flows.push('native dirty refresh dismissal retains entered weight');

    await page.getByRole('button', { name: /Layout Hero, Ranger, rank/ }).click();
    await page.getByRole('menuitem', { name: 'Logout', exact: true }).click();
    await page.getByRole('dialog', { name: 'Unsaved changes', exact: true }).waitFor();
    await screenshot(page, 'edge-dirty-logout', report);
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    assert.equal(await weight.inputValue(), '25');
    await page.getByRole('menuitem', { name: 'Logout', exact: true }).waitFor();
    assert.equal(await page.getByRole('menuitem', { name: 'Logout', exact: true }).evaluate(el => el === document.activeElement), true, 'logout focus restored after cancellation');
    await page.keyboard.press('Escape');
    await weight.focus();
    await page.setViewportSize({ width: 390, height: 420 });
    assert.equal(await page.getByRole('spinbutton').count(), 3, 'keyboard-height resize retains three cards');
    assert.equal(await weight.inputValue(), '25');
    assert.equal(await weight.evaluate(el => el === document.activeElement), true);
    await screenshot(page, 'edge-keyboard-height', report);
    report.flows.push('keyboard-height resize preserves exercise capacity, weight and focus');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /Layout Hero, Ranger, rank/ }).click();
    await page.getByRole('menuitem', { name: 'Logout', exact: true }).click();
    await page.getByRole('button', { name: 'Leave without saving', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Fixture sign out failed' }).waitFor();
    await page.getByRole('textbox', { name: 'Email address' }).waitFor();
    assert.equal(tables.gym_entries.find(entry => entry.session_id === draftId).weight, null, 'last saved draft remains after consent to leave');
    await screenshot(page, 'edge-failed-logout', report);
    report.flows.push('dirty logout cancellation restores focus; server sign-out failure survives local sign-out and last saved draft remains');
  } finally {
    await context.close();
    if (draftId) { tables.gym_sessions = tables.gym_sessions.filter(session => session.id !== draftId); tables.gym_entries = tables.gym_entries.filter(entry => entry.session_id !== draftId); }
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
    tables.habits=Array.from({length:1100},(_,i)=>({...BASE.habits[i%BASE.habits.length],id:'habit-'+i,name:'Training activity '+(i+1)}));
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
    const els=[...document.querySelectorAll('[id^="stage-"], .journey-checkpoint, .list-pagination button')].filter(e=>e.offsetParent!==null);
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
async function questFlows(browser, report) {
  loadProfile('representative');
  tables.long_quests.unshift({id:'quest-zero',user_id:uid,name:'Empty journey',stat:'STR',description:null,completed_at:null,created_at:date});
  tables.long_quests.push({id:'quest-solo',user_id:uid,name:'Solo journey',stat:'DEX',description:null,completed_at:null,created_at:date});
  tables.long_quest_stages.push({id:'stage-solo-0',long_quest_id:'quest-solo',user_id:uid,name:'Only step',done:false,position:0,description:'Keep this description.'});
  const {context,page}=await openApp(browser); page.on('pageerror',e=>report.errors.push('[quest flows] '+e.message));
  const card=name=>page.getByRole('button',{name:new RegExp(name)});
  const pager=page.getByRole('navigation',{name:'Long Quests pages'});
  try {
    await page.goto(WEB+'/longquests');
    // Zero-stage repair keeps the quest and gains a stage through the atomic save.
    await card('Empty journey').click();
    await page.locator('.journey-repair').waitFor();
    await page.getByRole('button',{name:'EDIT',exact:true}).click();
    await page.getByRole('button',{name:'+ Add stage',exact:true}).click();
    await page.getByPlaceholder('Stage 1...').fill('First waypoint');
    await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();
    await page.getByText('0 / 1 stages completed').waitFor();
    assert.equal(tables.long_quest_stages.filter(s=>s.long_quest_id==='quest-zero').length,1);
    report.flows.push('R4 zero-stage repair saves a first stage atomically');
    await card('Empty journey').click();
    // Many-stage quest: five checkpoints per segment with labelled navigation.
    await page.goto(WEB+'/longquests'); await page.getByRole('button',{name:/The crystal vault/}).click();
    const checkpoints=page.locator('.journey.is-expanded .journey-checkpoint');
    assert.equal(await checkpoints.count(),5);
    await page.getByRole('button',{name:'Next segment',exact:true}).click();
    await page.getByText('Segment 2 / 2').waitFor(); assert.equal(await checkpoints.count(),2);
    await page.getByRole('button',{name:'Previous segment',exact:true}).click();
    await page.getByText('Segment 1 / 2').waitFor();
    report.flows.push('R4 more than five checkpoints navigate by labelled segments');
    // Self-test: the detector must report a forced overlap, otherwise a clean result means nothing.
    const forced=await page.addStyleTag({content:'.journey-checkpoint{left:0!important;top:0!important}'});
    assert.ok((await overlaps(page)).length>0,'overlap detector failed to see a forced overlap');
    await forced.evaluate(el=>el.remove());
    // The named complaint: pagination controls must not sit on top of a phase checkbox when expanded.
    for(const [w,h] of [[320,568],[390,844],[768,1024],[1280,720],[1440,900],[1920,1080]]) {
      await page.setViewportSize({width:w,height:h});
      assert.deepEqual(await overlaps(page),[],`control overlap at ${w}x${h}`);
    }
    await page.setViewportSize({width:1440,height:900});
    report.flows.push('R4 expanded journey: no control overlap at six sizes');
    // Dirty edit protects collapse and page changes; Keep editing preserves input.
    await page.getByRole('button',{name:'EDIT',exact:true}).click();
    const name=page.getByRole('textbox',{name:'Quest name',exact:true});
    await name.fill('The crystal vault renamed');
    await card('The crystal vault').click();
    await (await guardDialog(page)).waitFor();
    await page.getByRole('button',{name:'Keep editing',exact:true}).click();
    assert.equal(await name.inputValue(),'The crystal vault renamed');
    await pager.getByRole('button',{name:'Next Long Quests page'}).click();
    await (await guardDialog(page)).waitFor();
    await page.getByRole('button',{name:'Keep editing',exact:true}).click();
    assert.equal(await name.inputValue(),'The crystal vault renamed');
    assert.match(await pager.getByText(/ \/ /).innerText(),/^1 \//);
    report.flows.push('R4 dirty collapse and page change are guarded; input retained');
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('button',{name:'Leave without saving',exact:true}).click();
    assert.equal(tables.long_quests.find(q=>q.id==='quest-0').name,'The crystal vault','abandoned edit must not save');
    // Single-stage quests stay editable without removal, and keep stage id/description.
    await card('The crystal vault').click();
    const pagesBefore=+(await pager.getByText(/ \/ /).innerText()).split('/')[1];
    for(let i=1;i<pagesBefore;i++) await pager.getByRole('button',{name:'Next Long Quests page'}).click();
    await card('Solo journey').click();
    await page.getByRole('button',{name:'EDIT',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/Remove stage/}).count(),0);
    await page.getByPlaceholder('Stage 1...').fill('Only step, renamed');
    await page.getByRole('button',{name:'SAVE CHANGES',exact:true}).click();
    await page.getByText('0 / 1 stages completed').first().waitFor();
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
    await page.getByText('Solo journey').waitFor({state:'detached'});
    const pagesAfter=+(await pager.getByText(/ \/ /).innerText()).split('/')[1];
    assert.ok(pagesAfter<=pagesBefore,'page count must not grow after deletion');
    assert.match(await pager.getByText(/ \/ /).innerText(),new RegExp(`^${pagesAfter} / ${pagesAfter}$`),'page clamps to the last page');
    report.flows.push('R4 deletion cancel restores focus, failure keeps dialog, retry deletes and page clamps');
    // Artwork survives confirmed completion and undo.
    await page.goto(WEB+'/longquests'); await page.getByRole('button',{name:/The crystal vault/}).click();
    await page.locator('#stage-stage-0-0').click();
    await page.waitForFunction(()=>document.querySelectorAll('.journey-checkpoint.completed').length===1);
    await page.locator('#stage-stage-0-0').click();
    await page.waitForFunction(()=>document.querySelectorAll('.journey-checkpoint.completed').length===0);
    assert.equal(await page.evaluate(()=>[...document.querySelectorAll('.journey img')].every(i=>i.complete && i.naturalWidth>0)),true);
    report.flows.push('R4 artwork intact after confirmed completion and undo');
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
    await page.goto(WEB+'/gym'); await page.getByRole('button',{name:'Start workout',exact:true}).click();
    const weight=page.getByRole('spinbutton',{name:'Current weight for Bench press in kg'});
    await weight.fill('25');
    // Routine switch with a dirty workout is guarded; Keep editing preserves selection and input.
    const select=page.locator('.gym-toolbar select');
    await select.selectOption('routine-lower');
    await (await guardDialog(page)).waitFor();
    await page.getByRole('button',{name:'Keep editing',exact:true}).click();
    assert.equal(await select.inputValue(),rid); assert.equal(await weight.inputValue(),'25');
    report.flows.push('R4 routine switch with a dirty workout is guarded and retains input');
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
    // Definitions cannot be edited while a snapshot draft exists.
    assert.equal(await page.getByRole('button',{name:'Edit',exact:true}).count(),0);
    await page.getByRole('button',{name:'Discard draft',exact:true}).click();
    await page.getByRole('dialog',{name:'Discard workout'}).getByRole('button',{name:'Confirm',exact:true}).click();
    await page.getByRole('button',{name:'Start workout',exact:true}).waitFor();
    report.flows.push('R4 exercise definitions are not editable while a draft snapshot exists');
    // Clearing a numeric prescription must stay blank, never coerce to zero, and block saving.
    await page.getByRole('button',{name:'Edit',exact:true}).first().click();
    const sets=page.getByLabel('Sets',{exact:true});
    await sets.fill(''); await sets.blur();
    assert.equal(await sets.inputValue(),'');
    await page.getByRole('button',{name:'Save exercise',exact:true}).click();
    assert.equal(await page.getByRole('dialog').count(),1,'invalid blank sets must keep the editor open');
    assert.equal(tables.gym_exercises[0].sets,3);
    report.flows.push('R4 cleared Sets stays blank (not zero) and blocks save');
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
      await page.goto(WEB+'/gym'); await page.getByText('Create your first routine, then add its exercises.').waitFor();
      report.flows.push('R5 empty account shows Long Quest and Gym empty states');
    }
    if(profile==='large') {
      const pages=Math.ceil(tables.long_quests.length/2);
      await page.getByText(new RegExp(`^1 / ${pages}$`)).waitFor();
      await page.getByText('0 / 12 stages completed').waitFor();
      report.flows.push(`R5 large catalog: ${tables.long_quests.length} quests paged ${pages}x; quest-0 keeps all 12 stages whose rows sit past the 1,000-row ceiling`);
      await page.goto(WEB+'/gym'); await page.getByRole('button',{name:'Start workout',exact:true}).click();
      const gymPages=Math.ceil(tables.gym_exercises.length/6);
      await page.getByText(new RegExp(`^1 / ${gymPages}$`)).waitFor();
      report.flows.push(`R5 large Gym routine: ${tables.gym_exercises.length} exercises paged ${gymPages}x`);
      // The Board reads habits in bounded batches, so a 1,100-habit catalog must not be cut off at the 1,000-row API cap.
      await page.goto(WEB+'/board'); await page.getByText(`${tables.habits.length} items`,{exact:true}).first().waitFor();
      report.flows.push(`R5 large Board: all ${tables.habits.length} habits shown, none cut off at the API cap`);
    }
    if(profile==='long') {
      await page.getByRole('button',{name:/Q0 /}).click();
      assert.deepEqual(await overlaps(page),[],'long names must not overlap controls');
      await page.goto(WEB+'/gym');
      await page.getByRole('button',{name:/Ünïcödé/}).first().waitFor();
      await page.locator('.gym-notes').first().click();
      const dialog=page.getByRole('dialog',{name:'Exercise notes'});
      await dialog.waitFor();
      assert.ok((await dialog.innerText()).length>=900,'full note is visible, not truncated');
      assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'note dialog does not scroll horizontally');
      await page.keyboard.press('Escape');
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
    await page.goto(WEB+'/gym'); await page.getByRole('button',{name:'Delete routine',exact:true}).click();
    await page.getByRole('dialog',{name:'Delete routine'}).waitFor();
    await page.keyboard.press('Escape'); await page.getByRole('dialog',{name:'Delete routine'}).waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Delete routine');
    report.flows.push('R5 confirmation dialog: Escape closes it and focus returns to its opener');
    // Cursor fallbacks: text, disabled and resize semantics survive the sword cursor.
    await page.getByRole('button',{name:'Create routine',exact:true}).click();
    const cursors=await page.evaluate(()=>{
      const css=e=>getComputedStyle(e).cursor;
      const input=document.querySelector('[data-eiyu-dialog] input[type=text], [data-eiyu-dialog] input:not([type])');
      return {text:input?css(input):null,button:css(document.querySelector('[data-eiyu-dialog] button'))};
    });
    assert.equal(cursors.text,'text','text fields keep the native text cursor');
    assert.match(cursors.button,/sword-action\.svg.*pointer/,'buttons use the sword with a pointer fallback');
    report.cursors=cursors; report.flows.push('R5 text-field cursor fallback checked');
  } finally { await context.close(); }
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
    if (process.argv.includes('--profiles')) {
      const only=process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',');
      const steps={quest:()=>questFlows(browser,report),gym:()=>gymFlows(browser,report),keyboard:()=>keyboardAcceptance(browser,report),
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
    await page.goto(WEB+'/longquests'); await page.getByText('The crystal vault',{exact:true}).waitFor();
    for(const [w,h] of [[320,568],[390,844],[768,1024],[1024,768],[1280,720],[1440,900],[1920,1080]]) {
      await page.setViewportSize({width:w,height:h});
      for(const dark of [true,false]) {
        await theme(page,dark); await screenshot(page,`quests-${w}-${h}-${dark?'dark':'light'}`,report);
      }
    }
    await page.setViewportSize({width:1440,height:900});
    await page.getByRole('button',{name:/The crystal vault/}).click();
    assert.equal(await page.locator('.journey.is-expanded .journey-map').evaluate(el=>el.getBoundingClientRect().height),240);
    await page.locator('.journey.is-expanded').getByRole('button',{name:'Cross the bridge. Locked. Complete earlier stages first.',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('stage-stage-0-1')===document.activeElement);
    await screenshot(page,'quests-expanded',report);
    await page.locator('#stage-stage-0-0').click();
    await page.getByRole('status',{name:'Confirmed XP reward'}).waitFor();
    assert.equal(await page.getByText('INT +20 XP',{exact:true}).count(),1);
    await page.waitForFunction(()=>document.querySelector('.journey-checkpoint.completed')!==null);
    await screenshot(page,'confirmed-xp',report);
    report.flows.push('confirmed actual XP and checkpoint advancement');
    await page.goto(WEB+'/gym');
    await page.getByRole('button',{name:'Bench press',exact:true}).click();
    await page.waitForFunction(()=>{const v=document.querySelector('video.gym-media');return v && v.readyState>=2 && !v.paused && v.currentTime>0;});
    assert(await page.locator('video.gym-media').evaluate(v=>v.muted && v.controls && v.playsInline));
    await page.locator('video.gym-media').evaluate(v=>window.closedPlayer=v);
    await page.keyboard.press('Escape');
    assert(await page.evaluate(()=>window.closedPlayer.paused));
    report.flows.push('muted inline MP4 autoplay and pause on close');
    await page.getByRole('button',{name:'Start workout',exact:true}).click();
    await page.getByRole('spinbutton',{name:'Current weight for Bench press in kg'}).fill('20');
    await page.getByRole('button',{name:/Layout Hero, Ranger, rank/}).click(); await page.getByRole('menuitem',{name:'Edit details'}).click();
    await page.getByRole('dialog',{name:'EDIT DETAILS',exact:true}).waitFor();
    await page.getByRole('button',{name:'Close EDIT DETAILS',exact:true}).click();
    await page.getByRole('dialog',{name:'EDIT DETAILS',exact:true}).waitFor({state:'hidden'});
    assert.equal(await page.getByRole('spinbutton',{name:'Current weight for Bench press in kg'}).inputValue(),'20');
    await page.getByRole('link',{name:'LONG QUESTS',exact:true}).click(); await page.getByRole('button',{name:'Keep editing',exact:true}).click();
    assert(page.url().includes('/gym'));
    await page.getByRole('button',{name:'Next Exercises page'}).click();
    assert.equal(await page.getByRole('spinbutton',{name:'Current weight for Curls in kg'}).inputValue(),'');
    await page.getByRole('spinbutton',{name:'Current weight for Curls in kg'}).press('e');
    await page.getByRole('button',{name:'Finish workout',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Enter a valid weight for Curls'}).waitFor();
    assert.equal(await page.getByRole('dialog',{name:'Finish with blank weights?'}).count(),0);
    await page.getByRole('spinbutton',{name:'Current weight for Curls in kg'}).fill('');
    await page.getByRole('button',{name:'Finish workout',exact:true}).click();
    await page.getByRole('button',{name:'Review fields',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[aria-label="Current weight for Rows in kg"]')===document.activeElement);
    await page.getByRole('button',{name:'Save draft',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Workout draft saved.'}).waitFor();
    await page.reload();
    await page.getByRole('button',{name:'Save draft',exact:true}).waitFor();
    assert.equal(await page.getByRole('spinbutton',{name:'Current weight for Bench press in kg'}).inputValue(),'20');
    report.flows.push('dirty Gym overlay preservation, guarded routing, offscreen blank review');
    report.flows.push('invalid offscreen weight blocks Finish and saved draft resumes after refresh');
    for(const [w,h] of [[320,568],[390,844],[768,1024],[1024,768],[1280,720],[1440,900],[1920,1080]]) {
      await page.setViewportSize({width:w,height:h});
      for(const dark of [true,false]) { await theme(page,dark); await screenshot(page,`gym-${w}-${h}-${dark?'dark':'light'}`,report); }
    }
    await page.getByRole('button',{name:'Finish workout',exact:true}).click(); await page.getByRole('button',{name:'Finish with blanks',exact:true}).click();
    await page.getByRole('button',{name:'Start workout',exact:true}).waitFor();
    await page.getByRole('button',{name:'Workout history',exact:true}).click();
    await page.locator('summary').filter({hasText:'Deleted routine'}).waitFor();
    assert.equal(await page.getByRole('combobox',{name:'Workouts'}).inputValue(),'');
    await screenshot(page,'history-deleted',report); await page.keyboard.press('Escape');
    report.flows.push('finish nulls, all-workout deleted-routine history');
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
    await page.goto(WEB+'/longquests'); await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.journey-hero').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    await page.route('**/art/journey-terrain.webp',route=>route.abort());
    await page.reload(); await page.locator('.journey-checkpoint').first().waitFor();
    assert.equal(await page.locator('.journey-checkpoint').count()>0,true);
    report.flows.push('reduced motion and functional missing-art fallback');
    const profile=path.join(OUT,'zoom-profile'); fs.mkdirSync(path.join(profile,'Default'),{recursive:true});
    fs.writeFileSync(path.join(profile,'Default','Preferences'),JSON.stringify({partition:{default_zoom_level:{x:Math.log(2)/Math.log(1.2)}}}));
    zoom=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:true,viewport:null,args:['--window-size=1280,900']}); await prepare(zoom);
    const zp=await zoom.newPage(); await zp.goto(WEB+'/longquests'); await zp.getByText('The crystal vault',{exact:true}).waitFor();
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
