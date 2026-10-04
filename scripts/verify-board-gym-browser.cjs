/** Local-only acceptance. Install playwright under .temp/plan-011/browser.
 * Supply PLAN011_JWT_SECRET from the isolated Auth container without logging it.
 * FFmpeg must be available on PATH for the small MP4 fixture.
 * Vite must run at 127.0.0.1:5175 with that stack's anon key; no saved .env changes.
 * All created users/media are disposable and removed in finally.
 */
const { chromium } = require('../.temp/plan-011/browser/node_modules/playwright');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('node:crypto');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
// Target an isolated stack explicitly; nothing is bound to these defaults unless you started it.
const API = process.env.PLAN011_API_URL ?? 'http://127.0.0.1:54321';
const WEB = process.env.PLAN011_WEB_URL ?? 'http://127.0.0.1:5175';
const OUT = '.temp/plan-011/browser-evidence';
function jwt(role) {
  if (!process.env.PLAN011_JWT_SECRET) throw new Error('Missing isolated test JWT secret.');
  const now = Math.floor(Date.now()/1000);
  const head = Buffer.from(JSON.stringify({ alg:'HS256',typ:'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ role,iss:'supabase',iat:now,exp:now+3600 })).toString('base64url');
  const input = `${head}.${body}`;
  return `${input}.${crypto.createHmac('sha256',process.env.PLAN011_JWT_SECRET).update(input).digest('base64url')}`;
}
let lastPage;
async function checked(result) { if (result.error) throw new Error(`Local API failed: ${result.error.code ?? result.error.status ?? 'unknown'}`); return result.data; }
async function main() {
  fs.mkdirSync(OUT,{recursive:true});
  const anon = jwt('anon');
  const options = {auth:{persistSession:false,autoRefreshToken:false}};
  const admin = createClient(API,jwt('service_role'),options);
  const client = createClient(API,anon,options);
  let userId, browser, zoomContext;
  const report = {flows:[],measurements:[],zoom:[],errors:[]};
  const createdMedia = new Set();
  try {
    const email = `plan011-${crypto.randomUUID()}@example.invalid`;
    const password = crypto.randomBytes(24).toString('base64url');
    const created = await checked(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{display_name:'Layout Hero'}}));
    userId = created.user.id;
    const {session} = await checked(await client.auth.signInWithPassword({email,password}));
    await checked(await client.rpc('update_profile',{p_display_name:'Layout Hero',p_user_class:'Developer'}));
    const today = new Date().toISOString().slice(0,10);
    await checked(await client.from('habits').insert([
      ...Array.from({length:8},(_,i)=>({user_id:userId,name:`Daily activity ${i+1}`,easy_version:'One minute',stat:'STR',difficulty:'Medium',days:[0,1,2,3,4,5,6],quest_type:'habit'})),
      ...Array.from({length:5},(_,i)=>({user_id:userId,name:`One-time activity ${i+1}`,easy_version:null,stat:'INT',difficulty:'Medium',days:[0,1,2,3,4,5,6],quest_type:'one_time',scheduled_date:today})),
    ]));
    const quest = await checked(await client.from('long_quests').insert({user_id:userId,name:'Reward journey',stat:'WIS'}).select('id').single());
    await checked(await client.from('long_quest_stages').insert([0,1].map(i=>({user_id:userId,long_quest_id:quest.id,name:`Phase ${i+1}`,position:i}))));
    browser = await chromium.launch({channel:'chrome',headless:true});
    const context = await browser.newContext({viewport:{width:1440,height:900}});
    await context.addInitScript(value => localStorage.setItem('sb-127-auth-token',JSON.stringify(value)),session);
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    lastPage = page;
    page.on('pageerror',error=>report.errors.push(error.message));
    page.on('requestfinished',request=>{
      const url=new URL(request.url()), prefix='/storage/v1/object/gym-exercise-media/';
      if(request.method()==='POST' && url.pathname.startsWith(prefix)) createdMedia.add(decodeURIComponent(url.pathname.slice(prefix.length)));
    });
    await page.goto(`${WEB}/board`);
    await page.getByRole('region',{name:'Daily Quest',exact:true}).waitFor();
    const daily = page.getByRole('region',{name:'Daily Quest',exact:true});
    await daily.getByRole('button',{name:'ADD QUEST',exact:true}).click();
    await page.getByRole('heading',{name:'NEW DAILY QUEST'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Monday',exact:true}).count(),1);
    await page.goto(`${WEB}/board`);
    await page.getByRole('region',{name:'One Time Quest',exact:true}).getByRole('button',{name:'ADD QUEST',exact:true}).click();
    await page.getByRole('heading',{name:'NEW ONE TIME QUEST'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Monday',exact:true}).count(),0);
    report.flows.push('separate creation forms');
    await page.goto(`${WEB}/board`);
    await page.getByRole('region',{name:'Daily Quest',exact:true}).getByRole('button',{name:'More actions for Daily activity 1',exact:true}).click();
    await page.getByRole('menuitem',{name:'Archive Daily activity 1',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Habit archived'}).waitFor();
    await page.getByRole('button',{name:'View archived habits'}).click();
    await page.getByRole('dialog',{name:'Archived habits',exact:true}).waitFor();
    await page.getByRole('button',{name:'Restore Daily activity 1',exact:true}).click();
    await page.getByRole('button',{name:'Restore Daily activity 1',exact:true}).waitFor({state:'hidden'});
    await page.keyboard.press('Escape');
    report.flows.push('archive notice, profile dialog and restore');
    await page.goto(`${WEB}/longquests`);
    // The first chain opens by default; open it only if it is closed. Stage rows are scoped by stable stage id.
    const chain = page.getByRole('button',{name:/Reward journey/}).first();
    if((await chain.getAttribute('aria-expanded'))!=='true') await chain.click();
    const stages = await checked(await client.from('long_quest_stages').select('id,name').eq('long_quest_id',quest.id).order('position'));
    const entry = i => page.locator(`#stage-${stages[i].id}`);
    const entryState = async i => (await entry(i).getAttribute('aria-label')).split('. ').slice(1).join('. ');
    // Opening the chain must never complete a stage.
    assert.equal(await entryState(0),'Available');
    assert.equal((await checked(await client.from('stats').select('xp').eq('stat','WIS').single())).xp,0);
    await entry(0).click();
    await page.waitForFunction(id=>document.getElementById(id)?.getAttribute('aria-label')?.endsWith('Completed'),`stage-${stages[0].id}`);
    await page.getByRole('status',{name:'Confirmed XP reward'}).filter({hasText:'WIS +20 XP'}).waitFor();
    assert.equal((await checked(await client.from('stats').select('xp').eq('stat','WIS').single())).xp,20);
    await entry(1).click();
    await page.waitForFunction(id=>document.getElementById(id)?.getAttribute('aria-label')?.endsWith('Completed'),`stage-${stages[1].id}`);
    assert.equal((await checked(await client.from('stats').select('xp').eq('stat','WIS').single())).xp,60);
    report.flows.push('real Long Quest phase rewards and completion bonus');
    await page.goto(`${WEB}/gym`);
    await page.getByRole('button',{name:'Create routine',exact:true}).click();
    await page.getByRole('dialog',{name:'Create routine',exact:true}).waitFor();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.getByRole('button',{name:'Save routine',exact:true}).evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button',{name:'Close Create routine',exact:true}).evaluate(e=>e===document.activeElement),true);
    report.flows.push('real dialog keyboard containment');
    await page.getByLabel('Routine name',{exact:true}).fill('Chest–Tricep–Shoulders');
    await page.getByRole('button',{name:'Save routine',exact:true}).click();
    await page.getByRole('button',{name:'Add exercise',exact:true}).click();
    await page.getByLabel('Exercise name',{exact:true}).fill('Bench press');
    await page.locator('input[type=file]').setInputFiles({name:'demonstration.gif',mimeType:'image/gif',buffer:Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')});
    await page.getByLabel('Notes',{exact:true}).fill('Keep a controlled tempo.');
    await page.getByRole('button',{name:'Save exercise',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.locator('.gym-list-item',{hasText:'Bench press'}).click();
    await page.locator('.gym-media').waitFor();
    await page.waitForFunction(()=>document.querySelector('.gym-media')?.naturalWidth>0);
    await page.screenshot({path:`${OUT}/demonstration.png`});
    // Reproduce an expired/unavailable signed object, then obtain fresh access.
    const signedObject = '**/storage/v1/object/sign/gym-exercise-media/**?token=*';
    // The guide is signed when the detail pane mounts, so reload the page to sign it again under the failing route.
    await page.route(signedObject,route=>route.fulfill({status:410,body:'Expired'}));
    await page.reload();
    await page.locator('.gym-list-item',{hasText:'Bench press'}).click();
    await page.getByRole('button',{name:'Reload video guide',exact:true}).waitFor();
    await page.unroute(signedObject);
    await page.getByRole('button',{name:'Reload video guide',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.gym-media')?.naturalWidth>0);
    const mediaBefore = await checked(await client.from('gym_exercises').select('media_path').single());
    const outsider = createClient(API,anon,options);
    assert.ok((await outsider.storage.from('gym-exercise-media').createSignedUrl(mediaBefore.media_path,60)).error);
    // A small local FFmpeg fixture exercises the real MP4 decoder and Storage.
    const clip = path.resolve('.temp/plan-011/demonstration.mp4');
    require('node:child_process').execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=cyan:s=64x64:d=1','-c:v','libx264','-pix_fmt','yuv420p',clip]);
    const mp4 = fs.readFileSync(clip);
    await page.getByRole('button',{name:/^Exercise actions for /}).click();
    await page.getByRole('menuitem',{name:'Edit exercise'}).click();
    await page.locator('input[type=file]').setInputFiles({name:'demonstration.mp4',mimeType:'video/mp4',buffer:mp4});
    await page.getByRole('button',{name:'Save exercise',exact:true}).click();
    await Promise.race([page.getByRole('dialog').waitFor({state:'hidden'}),page.getByRole('alert').waitFor().then(async()=>{throw new Error(await page.getByRole('alert').innerText());})]);
    assert.ok((await client.storage.from('gym-exercise-media').download(mediaBefore.media_path)).error);
    await page.locator('.gym-list-item',{hasText:'Bench press'}).click();
    await page.waitForFunction(()=>document.querySelector('video.gym-media')?.readyState>=1);
    // The guide no longer autoplays: it is muted, inline and has controls.
    assert.ok(await page.locator('video.gym-media').evaluate(v=>v.muted && v.controls && v.playsInline && v.paused));
    await page.locator('video.gym-media').evaluate(v=>v.play());
    await page.waitForFunction(()=>{const video=document.querySelector('video.gym-media');return video && !video.paused && video.currentTime>0;});
    report.flows.push('signed-media retry, anonymous access denied, MP4 replacement/playback on demand and old-object cleanup');
    await page.getByRole('button',{name:'Start workout',exact:true}).click();
    const weight = page.getByRole('spinbutton',{name:'Current weight for Bench press in kg',exact:true});
    await weight.fill('40');
    await page.getByRole('button',{name:'Finish workout',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Workout completed.'}).waitFor();
    await page.getByRole('button',{name:'Start workout',exact:true}).click();
    await page.getByText('40 kg',{exact:true}).waitFor();
    assert.equal(await weight.inputValue(),'');
    await page.reload();
    await page.getByRole('button',{name:'Save draft',exact:true}).waitFor();
    report.flows.push('routine/exercise creation, private GIF upload/playback, session finish, previous weight, draft refresh');
    for (const [width,height] of [[320,568],[390,844],[768,1024],[1024,768],[1280,720],[1440,900],[1920,1080]]) {
      await page.setViewportSize({width,height});
      for (const theme of ['dark','light']) {
        for (const route of ['board','gym','longquests','status']) {
          await page.goto(`${WEB}/${route}`);
          await page.getByRole('button',{name:/Layout Hero.*rank/}).waitFor();
          if (route==='board') await page.getByRole('region',{name:'Daily Quest',exact:true}).waitFor();
          if (route==='gym') await page.getByRole('button',{name:'Save draft',exact:true}).waitFor();
          if (route==='longquests') await page.getByText('Reward journey',{exact:true}).waitFor();
          if (route==='status') await page.getByRole('tab',{name:'STATS',exact:true}).waitFor();
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          await page.getByRole('button',{name:/Layout Hero.*rank/}).click();
          await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
          const toggle=page.getByRole('switch',{name:'Dark mode'});
          if((await toggle.getAttribute('aria-checked')==='true')!==(theme==='dark')) await toggle.click();
          await page.keyboard.press('Escape');
          await page.evaluate(()=>document.fonts.ready);
          const measurement = await page.evaluate(({width,height,theme,route})=>{
            const lanes=Array.from(document.querySelectorAll('.board-lane')).filter(e=>getComputedStyle(e).display!=='none').map(e=>({title:e.querySelector('h2')?.textContent,bottom:e.getBoundingClientRect().bottom,bodyOverflow:e.querySelector('.paged-list-body').scrollHeight>e.querySelector('.paged-list-body').clientHeight+1}));
            return {width,height,theme,route,horizontalOverflow:document.documentElement.scrollWidth>innerWidth+1,verticalOverflow:document.documentElement.scrollHeight>innerHeight+1,lanes};
          },{width,height,theme,route});
          report.measurements.push(measurement);
          if ((width===1280 || width===390) && theme==='dark') await page.screenshot({path:`${OUT}/${route}-${width}.png`,fullPage:true});
        }
      }
    }
    const overflowing=report.measurements.filter(m=>m.horizontalOverflow || m.lanes.some(l=>l.bodyOverflow));
    assert.deepEqual(overflowing.map(m=>`${m.route} ${m.width}x${m.height} ${m.theme}${m.horizontalOverflow?' page':''}${m.lanes.filter(l=>l.bodyOverflow).map(l=>' lane:'+l.title).join('')}`),[]);
    // Full cards and narrow exercise cards intentionally scroll in document flow.
    assert.equal(report.errors.length,0);
    await page.goto(`${WEB}/board`);
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.phase4-brand-mark').evaluate(e=>getComputedStyle(e).animationName),'none');
    report.flows.push('reduced-motion logo');
    await context.close();
    // Actual Chrome page zoom, using a disposable profile preference rather than CSS/CDP scaling.
    // Chromium ChromeZoomLevelPrefs uses partition key x for the default partition.
    const zoomProfile = path.resolve('.temp/plan-011/browser-zoom');
    assert.ok(zoomProfile.startsWith(path.resolve('.temp/plan-011') + path.sep));
    fs.mkdirSync(`${zoomProfile}/Default`,{recursive:true});
    fs.writeFileSync(`${zoomProfile}/Default/Preferences`,JSON.stringify({partition:{default_zoom_level:{x:Math.log(2)/Math.log(1.2)}}}));
    zoomContext = await chromium.launchPersistentContext(zoomProfile,{channel:'chrome',headless:true,viewport:null,args:['--window-size=1280,900']});
    await zoomContext.addInitScript(value=>localStorage.setItem('sb-127-auth-token',JSON.stringify(value)),session);
    const zoomPage = await zoomContext.newPage();
    for (const route of ['board','gym','longquests','status']) {
      await zoomPage.goto(`${WEB}/${route}`);
      await zoomPage.getByRole('button',{name:/Layout Hero.*rank/}).waitFor();
      if(route==='board') await zoomPage.getByRole('region',{name:'Daily Quest',exact:true}).waitFor();
      if(route==='gym') await zoomPage.getByRole('button',{name:'Save draft',exact:true}).waitFor();
      if(route==='longquests') await zoomPage.getByText('Reward journey',{exact:true}).waitFor();
      await zoomPage.evaluate(()=>document.fonts.ready);
      const zoom = await zoomPage.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio,scale:visualViewport.scale,overflow:document.documentElement.scrollWidth>innerWidth+1,narrow:matchMedia('(max-width:767px)').matches,controlsFit:[...document.querySelectorAll('.phase4-primary-nav a,.board-lane-tabs button')].every(e=>e.getBoundingClientRect().right<=innerWidth+1)}));
      assert.ok(zoom.width >= 600 && zoom.width <= 640);
      assert.equal(zoom.dpr,2);
      assert.equal(zoom.scale,1);
      assert.equal(zoom.narrow,true);
      assert.equal(zoom.overflow,false);
      assert.equal(zoom.controlsFit,true);
      report.zoom.push({route,...zoom});
      // Raw compositor capture avoids Playwright's CSS-sized crop at native browser zoom.
      const capture = await zoomContext.newCDPSession(zoomPage);
      const shot = await capture.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
      fs.writeFileSync(`${OUT}/${route}-200-percent.png`,Buffer.from(shot.data,'base64'));
      await capture.detach();
    }
    report.flows.push('actual Chrome 200% page zoom: four routes, reflow without horizontal overflow');

  } catch (error) {
    // Show what the user would have seen, never raw tokens: only visible alert/status/dialog text.
    if (lastPage) {
      const seen = await lastPage.evaluate(() => [...document.querySelectorAll('[role=alert],[role=status],[role=dialog]')].map(e => `${e.getAttribute('role')}: ${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 160)}`)).catch(() => []);
      await lastPage.screenshot({ path: `${OUT}/failure.png` }).catch(() => {});
      console.error('Visible at failure:', JSON.stringify(seen));
      // Sample the toast over time to tell a queued notice from one that never arrives.
      const timeline = [];
      for (let i = 0; i < 12; i++) { const text = await lastPage.evaluate(() => document.querySelector('.archive-notice')?.textContent?.trim().slice(0, 60) ?? '(none)').catch(() => '(page gone)'); if (timeline.at(-1) !== text) timeline.push(text); await new Promise(r => setTimeout(r, 2000)); }
      console.error('Toast sequence over 24s after failure:', JSON.stringify(timeline));
    }
    throw error;
  } finally {
    if (zoomContext) {
      for(const page of zoomContext.pages()) if(page.url().startsWith(WEB)) await page.evaluate(()=>localStorage.clear()).catch(()=>{});
      await zoomContext.clearCookies();
      await zoomContext.close();
    }
    if (browser) await browser.close();
    if (userId) {
      const {data} = await admin.from('gym_exercises').select('media_path').eq('user_id',userId);
      const {data:manifest} = await admin.from('gym_media_cleanup').select('path').eq('user_id',userId);
      const paths=[...new Set([...createdMedia,...(data??[]).map(e=>e.media_path),...(manifest??[]).map(e=>e.path)].filter(Boolean))];
      if(paths.length) await checked(await admin.storage.from('gym-exercise-media').remove(paths));
      await checked(await admin.auth.admin.deleteUser(userId));
    }
    fs.writeFileSync(`${OUT}/report.json`,JSON.stringify(report,null,2));
  }
  console.log(JSON.stringify({flows:report.flows,measurements:report.measurements.length,horizontalFailures:report.measurements.filter(m=>m.horizontalOverflow).map(m=>({width:m.width,route:m.route,theme:m.theme})),pageErrors:report.errors}));
}
main().catch(error=>{console.error(`Browser acceptance failed: ${error.message}`);process.exitCode=1;});
