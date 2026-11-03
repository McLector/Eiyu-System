import {admittedFixtureData} from './test-helpers/admission.ts';
import {createInstrumentedTestHandler as createAiProxyHandler} from './test-helpers/admission.ts';

function assert(value: unknown, message: string): asserts value {if (!value) throw new Error(message);}
const allowed = {allowed: true, attemptNumber: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0};
function fixture(options: {begin?: unknown; beginError?: string; retryError?: string; revoked?: () => boolean; access?: unknown;
  generate?: (reserve: (attempt: number) => Promise<boolean>) => Promise<{summary: string}>} = {}) {
  let generated = 0, refunds = 0, retries = 0;
  let forwarded: Record<string, unknown> | undefined;
  const client = {auth: {getUser: async () => ({data: {user: {id: 'synthetic-processing-owner'}}, error: null})},
    rpc: async (name: string,args:Record<string,unknown>) => {
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
      return options.generate ? options.generate(reserve) : {summary: 'Synthetic reviewed debrief'};
    }});
  return {call: () => handler(new Request('https://local.test/ai', {method: 'POST',
    headers: {Authorization: 'Bearer synthetic-processing-token'}, body: JSON.stringify({
      action: 'weekly-summary', weekStart: '2026-10-19',
      processingAccess: 'access' in options ? options.access
        : {contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0},
    })})), counts: () => ({generated, refunds, retries}), forwarded: () => forwarded};
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

