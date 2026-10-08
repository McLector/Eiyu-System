/** Local-only acceptance for the web layout fit (slice 8). Needs playwright under .temp/plan-011/browser.
 *
 *   node scripts/verify-layout-fit-browser.cjs auth    sign-in page fit; needs only Vite (dummy env, no network)
 *   node scripts/verify-layout-fit-browser.cjs board   Daily Quest rows; needs the isolated Supabase stack
 *
 * Vite must run at LAYOUT_WEB_URL (default http://127.0.0.1:5176). For `board` also set LAYOUT_API_URL to the
 * isolated stack (default http://127.0.0.1:54321) and LAYOUT_JWT_SECRET from its Auth container (never logged);
 * Vite must be started with that stack's URL/anon key as env overrides, never the saved web/.env.
 * Exits non-zero when a fit target is missed. Pass LAYOUT_BASELINE=1 to only report.
 */
const { chromium } = require('../.temp/plan-011/browser/node_modules/playwright');
const crypto = require('node:crypto');
const fs = require('node:fs');

const WEB = process.env.LAYOUT_WEB_URL ?? 'http://127.0.0.1:5176';
const API = process.env.LAYOUT_API_URL ?? 'http://127.0.0.1:54321';
const OUT = '.temp/slice8';
// Browser-window sizes of common screens: 1366x768, 1920x1080 at 125%, 1920x1080 at 100%.
const VIEWPORTS = [{ width: 1366, height: 625 }, { width: 1536, height: 730 }, { width: 1920, height: 945 }];
const baselineOnly = process.env.LAYOUT_BASELINE === '1';
const failures = [];

async function authModes(page) {
  const modes = {
    login: async () => {},
    forgot: async () => { await page.getByRole('button', { name: 'Forgot password?' }).click(); },
    signup: async () => { await page.getByRole('button', { name: 'Register' }).click(); },
    'signup+strength': async () => {
      await page.getByRole('button', { name: 'Register' }).click();
      await page.getByLabel('Password', { exact: true }).fill('Correct-Horse-9');
    },
  };
  return modes;
}

async function fits(page, setup, height, width) {
  await page.setViewportSize({ width, height });
  await page.goto(`${WEB}/auth`);
  await page.getByRole('heading', { name: 'EIYU SYSTEM' }).waitFor();
  await setup();
  return page.evaluate(() => ({ doc: document.documentElement.scrollHeight, inner: innerHeight }));
}

async function auth(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const modeSetup = await authModes(page);
  const report = [];
  for (const [mode, setup] of Object.entries(modeSetup)) {
    for (const vp of VIEWPORTS) {
      const m = await fits(page, setup, vp.height, vp.width);
      const ok = m.doc <= m.inner;
      report.push({ mode, viewport: `${vp.width}x${vp.height}`, contentHeight: m.doc, fits: ok });
      if (!ok) failures.push(`auth ${mode} scrolls at ${vp.width}x${vp.height} (content ${m.doc}px)`);
      if (mode === 'signup+strength') await page.screenshot({ path: `${OUT}/auth-${vp.width}x${vp.height}.png` });
    }
    // Smallest height (10px steps) at which the page stops scrolling, at the narrowest width.
    let min = null;
    for (let h = 1000; h >= 400; h -= 10) {
      const m = await fits(page, setup, h, 1366);
      if (m.doc <= m.inner) min = h; else break;
    }
    report.push({ mode, minFitHeight: min });
  }
  await context.close();
  return report;
}

function jwt(role) {
  if (!process.env.LAYOUT_JWT_SECRET) throw new Error('Missing isolated test JWT secret (LAYOUT_JWT_SECRET).');
  const now = Math.floor(Date.now() / 1000);
  const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ role, iss: 'supabase', iat: now, exp: now + 3600 })}`;
  return `${input}.${crypto.createHmac('sha256', process.env.LAYOUT_JWT_SECRET).update(input).digest('base64url')}`;
}

async function board(browser) {
  const { createClient } = require('@supabase/supabase-js');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(API, jwt('service_role'), options);
  const client = createClient(API, jwt('anon'), options);
  const checked = result => { if (result.error) throw new Error(`Local API failed: ${result.error.code ?? result.error.status ?? 'unknown'}`); return result.data; };
  const email = `layout-${crypto.randomUUID()}@example.invalid`;
  const password = crypto.randomBytes(24).toString('base64url');
  let userId;
  try {
    userId = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: 'Layout Hero' } })).user.id;
    const { session } = checked(await client.auth.signInWithPassword({ email, password }));
    checked(await client.rpc('update_profile', { p_display_name: 'Layout Hero', p_user_class: 'Developer' }));
    const today = new Date().toISOString().slice(0, 10);
    const make = (type, i, extra = {}) => ({ user_id: userId, name: `${type} ${i + 1}`, easy_version: 'One minute', stat: 'STR', difficulty: 'Medium', days: [0, 1, 2, 3, 4, 5, 6], quest_type: type === 'Daily' ? 'habit' : 'one_time', ...extra });
    checked(await client.from('habits').insert([
      ...Array.from({ length: 14 }, (_, i) => make('Daily', i)),
      // The tallest card: a progress stepper and a name too long to fit, so a shorter card height cannot clip it.
      make('Daily', 14, { name: 'A very long daily quest name that has to be cut off with an ellipsis', target_count: 5 }),
      ...Array.from({ length: 14 }, (_, i) => make('One-time', i, { easy_version: null, scheduled_date: today })),
    ]));
    const report = [];
    // The stack's own auth-token key is "sb-<host first label>-auth-token"; the existing scripts use sb-127-auth-token.
    const key = `sb-${new URL(API).hostname.split('.')[0]}-auth-token`;
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: vp });
      await context.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [key, session]);
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const supabaseHosts = new Set();
      page.on('request', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/auth/v1') || u.pathname.startsWith('/rest/v1')) supabaseHosts.add(u.host); });
      await page.goto(`${WEB}/board`);
      await page.getByRole('region', { name: 'Daily Quest', exact: true }).waitFor();
      await page.locator('.quest-card').first().waitFor();
      const expectedHost = new URL(API).host;
      if ([...supabaseHosts].some(h => h !== expectedHost)) throw new Error(`Page talks to ${[...supabaseHosts].join(', ')}, not the isolated stack ${expectedHost}`);
      const m = await page.evaluate(() => {
        const lane = id => {
          const el = document.querySelector(`[data-testid="board-lane-${id}"]`);
          const body = el.querySelector('.paged-list-body');
          const r = el.getBoundingClientRect();
          return {
            rows: el.querySelectorAll('.quest-card').length,
            laneTop: Math.round(r.top), laneBottom: Math.round(r.bottom),
            headerH: Math.round(el.querySelector('.board-lane-header').getBoundingClientRect().height),
            pagerH: Math.round(el.querySelector('.list-pagination').getBoundingClientRect().height),
            bodyH: body.clientHeight,
            cardH: Math.round(el.querySelector('.quest-card')?.getBoundingClientRect().height ?? 0),
            cardsClipped: [...el.querySelectorAll('.quest-card')].some(c => c.scrollHeight > c.clientHeight + 1),
          };
        };
        return { inner: innerHeight, pageScrolls: document.documentElement.scrollHeight > innerHeight, daily: lane('daily-quest'), oneTime: lane('one-time-quest'), backlog: lane('backlog') };
      });
      await page.screenshot({ path: `${OUT}/board-${vp.width}x${vp.height}.png` });
      report.push({ viewport: `${vp.width}x${vp.height}`, ...m });
      if (m.daily.laneBottom > m.inner) failures.push(`board lane bottom ${m.daily.laneBottom} is below the viewport ${m.inner} at ${vp.width}x${vp.height}`);
      if (m.daily.cardsClipped) failures.push(`a card clips its content at ${vp.width}x${vp.height}`);
      await context.close();
    }
    return report;
  } finally {
    if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
  }
}

(async () => {
  const which = process.argv[2];
  if (!['auth', 'board'].includes(which)) throw new Error('Usage: verify-layout-fit-browser.cjs auth|board');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const report = which === 'auth' ? await auth(browser) : await board(browser);
    console.log(JSON.stringify(report, null, 1));
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.error(`\n${failures.length} fit target(s) missed:\n - ${failures.join('\n - ')}`);
    if (!baselineOnly) process.exit(1);
  } else console.log('\nAll fit targets met.');
})().catch(error => { console.error(error.message); process.exit(1); });
