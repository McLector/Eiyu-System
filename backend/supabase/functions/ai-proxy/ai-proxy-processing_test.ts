import {admittedFixtureData} from './test-helpers/admission.ts';
import {createInstrumentedTestHandler as createAiProxyHandler} from './test-helpers/admission.ts';

function assert(value: unknown, message: string): asserts value {if (!value) throw new Error(message);}
const allowed = {allowed: true, attemptNumber: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0};
function fixture(options: {begin?: unknown; beginError?: string; retryError?: string; revoked?: () => boolean; access?: unknown;
  action?: 'weekly-summary' | 'stage-breakdown';
  generate?: (reserve: (attempt: number) => Promise<boolean>) => Promise<Record<string, unknown>>} = {}) {
  let generated = 0, refunds = 0, retries = 0;
  let forwarded: Record<string, unknown> | undefined;
  const rpcNames: string[] = [];
  const action = options.action ?? 'weekly-summary';
  const client = {auth: {getUser: async () => ({data: {user: {id: 'synthetic-processing-owner'}}, error: null})},
    rpc: async (name: string,args:Record<string,unknown>) => {
      rpcNames.push(name);
      if (name === 'ai_admit_execution') return options.beginError ? {data: null, error: {code: options.beginError}}
        : {data: admittedFixtureData(options.begin ?? allowed,args), error: null};
      if (name === 'ai_release_request') {refunds++; return {data: true, error: null};}
      if (name === 'ai_settle_execution') return {data:true,error:null};
      if (name === 'ai_prepare_execution_result') return options.revoked?.()?{data:null,error:{code:'EP002'}}:{data:true,error:null};
      if (name === 'ai_authorize_execution_attempt') {if(args.p_attempt_number===1)return{data:true,error:null};retries++; return options.retryError
        ? {data: null, error: {code: options.retryError}} : {data: true, error: null};}
      return {data: null, error: new Error('Unexpected fake RPC')};
    }};
  const handler = createAiProxyHandler({createUserClient: () => client, createServiceClient: () => client,
    generate: async (_action, payload, reserve) => {
      forwarded = payload;
      generated++;
      return options.generate ? options.generate(reserve)
        : action === 'stage-breakdown' ? {stages: ['Pick a route', 'Walk it once', 'Finish it']} : {summary: 'Synthetic reviewed debrief'};
    }});
  const subject = action === 'stage-breakdown' ? {action, questName: 'Finish a long hike', stat: 'STR'} : {action, weekStart: '2026-10-19'};
  return {call: () => handler(new Request('https://local.test/ai', {method: 'POST',
    headers: {Authorization: 'Bearer synthetic-processing-token'}, body: JSON.stringify({
      ...subject,
      processingAccess: 'access' in options ? options.access
        : {contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0},
    })})), counts: () => ({generated, refunds, retries}), forwarded: () => forwarded, rpcNames: () => rpcNames};
}

for (const access of [undefined, null, {}, {contractVersion: 0},
  {contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: '2', authorityVersion: 0}]) {
  Deno.test(`weekly requests missing valid captured consent contract fail before quota: ${JSON.stringify(access)}`, async () => {
    const f = fixture({access}); const response = await f.call();
    assert(response.status === 400 && f.counts().generated === 0 && f.counts().refunds === 0, 'old/malformed client cannot borrow a current grant');
  });
}
for (const key of ['ageVersion', 'mailboxVersion', 'consentVersion', 'authorityVersion'] as const) {
  Deno.test(`a later ${key} cannot replace a request's captured grant`, async () => {
    const f = fixture({begin: {...allowed, [key]: allowed[key] + 1}});
    const response = await f.call();
    assert(response.status === 403 && f.counts().generated === 0 && f.counts().refunds === 1, 'stale expected tuple denies before provider with one refund');
  });
}
Deno.test('processing revision metadata is never passed to the generator payload', async () => {
  const f = fixture(); const response = await f.call();
  assert(response.status === 200 && !Object.hasOwn(f.forwarded() ?? {}, 'processingAccess'), 'authorization tuple stays outside prompt input');
});

for (const key of ['consentVersion', 'authorityVersion']) {
  for (const invalid of [undefined, null, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
    Deno.test(`weekly generation rejects invalid ${key}: ${String(invalid)}`, async () => {
      const f = fixture({begin: {...allowed, [key]: invalid}}); const response = await f.call();
      assert(response.status === 503, 'missing/malformed processing capability must be unavailable');
      assert(f.counts().generated === 0 && f.counts().refunds === 1, 'deny before provider and release logical charge exactly once');
    });
  }
}
Deno.test('weekly generation requires a positive consent revision', async () => {
  const f = fixture({begin: {...allowed, consentVersion: 0}}); const response = await f.call();
  assert(response.status === 503 && f.counts().generated === 0 && f.counts().refunds === 1, 'zero is not a captured specific grant');
});
for (const code of ['EP001', 'EP002']) {
  Deno.test(`processing denial ${code} is a readable403 before provider traffic`, async () => {
    const f = fixture({beginError: code}); const response = await f.call(); const body = await response.text();
    assert(response.status === 403 && /permission|access changed/i.test(body), 'processing denial must identify the recoverable access issue');
    assert(!/adult|18\+/.test(body) && f.counts().generated === 0 && f.counts().refunds === 0, 'do not invent adult-only policy or refund an unreserved request');
  });
  Deno.test(`processing retry denial ${code} stops and refunds once`, async () => {
    const f = fixture({retryError: code, generate: async reserve => {
      if (!await reserve(2)) throw new Error('Synthetic denied retry');
      return {summary: 'Must never release'};
    }});
    const response = await f.call();
    assert(response.status === 403 && f.counts().retries === 1 && f.counts().refunds === 1, 'stop on current-purpose/revision denial with one refund');
    assert(!(await response.text()).includes('Must never release'), 'never expose denied output');
  });
}
Deno.test('reviewed eligibility is server owned; no adult fact is needed in the Edge receipt', async () => {
  const f = fixture(); const response = await f.call();
  assert(response.status === 200 && f.counts().generated === 1 && f.counts().refunds === 0, 'complete reviewed receipt authorizes the existing route');
});
Deno.test('revocation during a held synthetic response denies release and refunds once', async () => {
  let finish!: () => void, started!: () => void, revoked = false;
  const held = new Promise<void>(resolve => {finish = resolve;});
  const generating = new Promise<void>(resolve => {started = resolve;});
  const f = fixture({revoked: () => revoked, generate: async () => {
    started(); await held; return {summary: 'Private response from withdrawn permission'};
  }});
  const pending = f.call(); await generating; revoked = true; finish();
  const response = await pending;
  assert(response.status === 403 && f.counts().refunds === 1, 'revoked grant cannot release a held response');
  assert(!(await response.text()).includes('Private response from withdrawn permission'), 'no revoked output leak');
});


// Part J: chain stage suggestions follow the same access rules as the weekly review.
const stage = {action: 'stage-breakdown'} as const;
for (const access of [undefined, null, {}, {contractVersion: 0},
  {contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: '2', authorityVersion: 0}]) {
  Deno.test(`stage requests missing a valid captured access contract fail before quota: ${JSON.stringify(access)}`, async () => {
    const f = fixture({...stage, access}); const response = await f.call();
    assert(response.status === 400 && f.counts().generated === 0 && !f.rpcNames().includes('ai_admit_execution'),
      'a stage request without the captured revisions never reaches admission or the provider');
  });
}
for (const key of ['ageVersion', 'mailboxVersion', 'consentVersion', 'authorityVersion'] as const) {
  Deno.test(`a later ${key} cannot replace a stage request's captured grant`, async () => {
    const f = fixture({...stage, begin: {...allowed, [key]: allowed[key] + 1}});
    const response = await f.call();
    assert(response.status === 403 && f.counts().generated === 0 && f.counts().refunds === 1, 'stale tuple denies before the provider with one refund');
  });
}
for (const key of ['mailboxVersion', 'consentVersion', 'authorityVersion']) {
  Deno.test(`stage generation rejects a ticket without a valid ${key}`, async () => {
    const f = fixture({...stage, begin: {...allowed, [key]: undefined}}); const response = await f.call();
    assert(response.status === 503 && f.counts().generated === 0 && f.counts().refunds === 1, 'incomplete access ticket is unavailable and refunded once');
  });
}
Deno.test('a stage request sends only the quest name and stat to the generator, never the revisions', async () => {
  const f = fixture(stage); const response = await f.call();
  assert(response.status === 200 && (await response.json()).stages?.length === 3, 'stages are returned');
  assert(JSON.stringify(f.forwarded()) === JSON.stringify({action: 'stage-breakdown', questName: 'Finish a long hike', stat: 'STR'}),
    'prompt input carries no tracker text and no authorization tuple');
  assert(!f.rpcNames().includes('ai_tracker_week_input'), 'no weekly evidence is read for a stage request');
});
for (const code of ['EP001', 'EP002']) {
  Deno.test(`stage processing denial ${code} is a readable 403 before provider traffic`, async () => {
    const f = fixture({...stage, beginError: code}); const response = await f.call(); const body = await response.text();
    assert(response.status === 403 && /permission|access changed/i.test(body) && f.counts().generated === 0 && f.counts().refunds === 0,
      'recoverable denial, nothing to refund');
  });
  Deno.test(`stage retry denial ${code} stops and refunds once`, async () => {
    const f = fixture({...stage, retryError: code, generate: async reserve => {
      if (!await reserve(2)) throw new Error('Synthetic denied retry');
      return {stages: ['Must never release']};
    }});
    const response = await f.call();
    assert(response.status === 403 && f.counts().retries === 1 && f.counts().refunds === 1, 'stop on denial with one refund');
    assert(!(await response.text()).includes('Must never release'), 'never expose denied output');
  });
}
Deno.test('revocation during a held stage response denies release and refunds once', async () => {
  let finish!: () => void, started!: () => void, revoked = false;
  const held = new Promise<void>(resolve => {finish = resolve;});
  const generating = new Promise<void>(resolve => {started = resolve;});
  const f = fixture({...stage, revoked: () => revoked, generate: async () => {started(); await held; return {stages: ['Private stage from withdrawn permission']};}});
  const pending = f.call(); await generating; revoked = true; finish();
  const response = await pending;
  assert(response.status === 403 && f.counts().refunds === 1, 'revoked grant cannot release a held stage list');
  assert(!(await response.text()).includes('Private stage from withdrawn permission'), 'no revoked output leak');
});
// G1 removed the birthday field, so no error may send anyone to look for one.
for (const action of ['weekly-summary', 'stage-breakdown'] as const) {
  Deno.test(`${action}: the adult-eligibility refusal does not mention a birthday`, async () => {
    const f = fixture({action, beginError: 'EA001'}); const response = await f.call(); const body = await response.text();
    assert(response.status === 403 && /18/.test(body) && !/birthday|birth/i.test(body), `message must point at the 18+ box, got: ${body}`);
  });
}
