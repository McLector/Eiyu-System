import {admittedFixtureData} from './test-helpers/admission.ts';
import {createInstrumentedTestHandler as createAiProxyHandler} from './test-helpers/admission.ts';
import './ai-proxy-generator_test.ts';
import './ai-proxy-providers_test.ts';
import './ai-proxy-failover_test.ts';
import './ai-proxy-refund_test.ts';

type RpcResponse = { data: unknown; error: unknown };
type FakeClient = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResponse>;
};

function fakeClient(options: {
  userId?: string | null;
  begin?: RpcResponse;
  nextAttempt?: RpcResponse;
  completion?: RpcResponse;
  onRpc?: (name: string, args: Record<string, unknown>) => void;
} = {}): FakeClient {
  return {
    auth: {
      getUser: async () => ({ data: { user: options.userId === null ? null : { id: options.userId ?? 'verified-user' } }, error: null }),
    },
    rpc: async (name, args) => {
      options.onRpc?.(name, args);
      if (name === 'ai_admit_execution') {
        const result=options.begin ?? { data: { allowed: true, ageVersion: 1, requestClass: 'suggestion', attemptNumber: 1 }, error: null };
        return {...result,data:admittedFixtureData(result.data,args)};
      }
      if (name === 'ai_authorize_execution_attempt') {
        if(args.p_attempt_number===1)return {data:true,error:null};
        return options.nextAttempt?.data===false?{data:null,error:{code:'EQ001'}}:options.nextAttempt??{data:true,error:null};
      }
      if (name === 'ai_settle_execution') return {data:true,error:null};
      if (name === 'ai_prepare_execution_result') return options.completion?.data===false?{data:null,error:{code:'EP002'}}:options.completion ?? { data: true, error: null };
      if (name === 'ai_release_request') return { data: true, error: null };
      return { data: null, error: new Error(`unexpected RPC ${name}`) };
    },
  };
}

const authHeaders = { Authorization: 'Bearer disposable-test-token' };

Deno.test('mailbox denial returns 403 before weekly provider traffic', async () => {
 let generated=false;const client=fakeClient({begin:{data:null,error:{code:'EM001'}}});
 const handler=createAiProxyHandler({createUserClient:()=>client,createServiceClient:()=>client,generate:async()=>{generated=true;return {summary:'private'};}});
 const r=await handler(new Request('https://local.test/ai',{method:'POST',headers:authHeaders,body:JSON.stringify({action: 'weekly-summary', processingAccess: {contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0},weekStart:'2026-10-05'})}));
 if(r.status!==403||generated||!(await r.text()).includes('Verify your email'))throw Error('mailbox denial must precede spend');
});
Deno.test('old backend without mailbox contract denies weekly traffic', async () => {
 let generated=false;const client=fakeClient();
 const handler=createAiProxyHandler({createUserClient:()=>client,createServiceClient:()=>client,generate:async()=>{generated=true;return {summary:'private'};}});
 const r=await handler(new Request('https://local.test/ai',{method:'POST',headers:authHeaders,body:JSON.stringify({action: 'weekly-summary', processingAccess: {contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0},weekStart:'2026-10-05'})}));
 if(r.status!==503||generated)throw Error('missing mailbox revision must fail closed');
});
Deno.test('a mailbox-bound weekly request succeeds only after the final check', async () => {
 const client=fakeClient({begin:{data:{allowed:true,attemptNumber:1,ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0},error:null}});
 const handler=createAiProxyHandler({createUserClient:()=>client,createServiceClient:()=>client,generate:async()=>({summary:'Allowed debrief'})});
 const r=await handler(new Request('https://local.test/ai',{method:'POST',headers:authHeaders,body:JSON.stringify({action: 'weekly-summary', processingAccess: {contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0},weekStart:'2026-10-05'})}));
 if(r.status!==200||(await r.json()).summary!=='Allowed debrief')throw Error('verified adult weekly output required');
});
Deno.test('mailbox loss during weekly generation discards the result and refunds', async () => {
 let refunds=0;const client=fakeClient({begin:{data:{allowed:true,attemptNumber:1,ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0},error:null},completion:{data:false,error:null},onRpc:name=>{if(name==='ai_release_request')refunds++;}});
 const handler=createAiProxyHandler({createUserClient:()=>client,createServiceClient:()=>client,generate:async()=>({summary:'Late private debrief'})});
 const r=await handler(new Request('https://local.test/ai',{method:'POST',headers:authHeaders,body:JSON.stringify({action: 'weekly-summary', processingAccess: {contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0},weekStart:'2026-10-05'})}));
 if(r.status!==403||refunds!==1||(await r.text()).includes('Late private debrief'))throw Error('late mailbox result must be discarded and refunded');
});
Deno.test('mailbox denial on a weekly retry stops the attempt and refunds', async () => {
 let refunds=0;const client=fakeClient({begin:{data:{allowed:true,attemptNumber:1,ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0},error:null},nextAttempt:{data:null,error:{code:'EM001'}},onRpc:name=>{if(name==='ai_release_request')refunds++;}});
 const handler=createAiProxyHandler({createUserClient:()=>client,createServiceClient:()=>client,generate:async(_action,_body,reserve)=>{if(!await reserve(2))throw Error('denied');return {summary:'Bypass'};}});
 const r=await handler(new Request('https://local.test/ai',{method:'POST',headers:authHeaders,body:JSON.stringify({action: 'weekly-summary', processingAccess: {contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0},weekStart:'2026-10-05'})}));
 if(r.status!==403||refunds!==1||!(await r.text()).includes('Verify your email'))throw Error('retry denial must refund without another model attempt');
});

Deno.test('server adult eligibility denial returns 403 without provider traffic', async () => {
  let generated = false;
  const client = fakeClient({ begin: { data: null, error: { code: 'EA001' } } });
  const handler = createAiProxyHandler({ createUserClient: () => client, createServiceClient: () => client,
    generate: async () => { generated = true; return { stages: ['one'] }; } });
  const response = await handler(new Request('https://local.test/ai', { method: 'POST', headers: authHeaders,
    body: JSON.stringify({ action: 'stage-breakdown', questName: 'Read', stat: 'INT', processingAccess: { contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0 } }) }));
  if (response.status !== 403 || generated) throw new Error('age denial must return 403 before a model request');
});
Deno.test('a birthday restriction during generation discards the response and refunds', async () => {
  let refunds = 0;
  const client = fakeClient({ begin: { data: { allowed: true, attemptNumber: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0 }, error: null },
    completion: { data: false, error: null }, onRpc: name => { if (name === 'ai_release_request') refunds++; } });
  const handler = createAiProxyHandler({ createUserClient: () => client, createServiceClient: () => client,
    generate: async () => ({ stages: ['Do not release'] }) });
  const response = await handler(new Request('https://local.test/ai', { method: 'POST', headers: authHeaders,
    body: JSON.stringify({ action: 'stage-breakdown', questName: 'Read', stat: 'INT', processingAccess: { contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0 } }) }));
  if (response.status !== 403 || refunds !== 1 || JSON.stringify(await response.json()).includes('Do not release')) {
    throw new Error('a final fresh age check must discard the output and refund the logical request');
  }
});
Deno.test('an older quota backend without the age contract fails closed before generation', async () => {
  let generated = false;
  const client = fakeClient({ begin: { data: { allowed: true, attemptNumber: 1 }, error: null } });
  const handler = createAiProxyHandler({ createUserClient: () => client, createServiceClient: () => client,
    generate: async () => { generated = true; return { stages: ['one'] }; } });
  const response = await handler(new Request('https://local.test/ai', { method: 'POST', headers: authHeaders,
    body: JSON.stringify({ action: 'stage-breakdown', questName: 'Read', stat: 'INT', processingAccess: { contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0 } }) }));
  if (response.status !== 503 || generated) throw new Error('missing age contract must fail closed');
});

Deno.test('invalid AI payloads reserve no logical or provider quota', async () => {
  let rpcCount = 0;
  let generateCount = 0;
  const client = fakeClient({ onRpc: () => rpcCount++ });
  const handler = createAiProxyHandler({
    createUserClient: () => client,
    createServiceClient: () => client,
    generate: async () => { generateCount++; return { suggestions: ['short walk'] }; },
  });
  const response = await handler(new Request('https://local.test/ai', {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ action: 'easy-versions', habitName: '   ' }),
  }));
  if (response.status !== 400 || rpcCount !== 0 || generateCount !== 0) {
    throw new Error(`expected validation before quota/provider; got status=${response.status}, rpc=${rpcCount}, generate=${generateCount}`);
  }
});

Deno.test('verified identity, not a caller-supplied user id, begins one logical request', async () => {
  const observed: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = fakeClient({ onRpc: (name, args) => observed.push({ name, args }) });
  const handler = createAiProxyHandler({
    createUserClient: () => client,
    createServiceClient: () => client,
    generate: async () => ({ suggestions: ['read one page', 'write one line', 'take a short walk'] }),
    requestId: () => 'request-123',
  });
  const response = await handler(new Request('https://local.test/ai', {
    method: 'POST', headers: authHeaders,
    body: JSON.stringify({ action: 'easy-versions', habitName: 'Read', stat: 'INT', userId: 'forged-user', requestClass: 'regeneration' }),
  }));
  const body = await response.json();
  const begin = observed.find(call => call.name === 'ai_admit_execution');
  if (response.status !== 200 || body.suggestions?.length !== 3 || !begin || begin.args.p_user_id !== 'verified-user') {
    throw new Error('expected successful output and the authenticated user id in the quota RPC');
  }
  if (observed.map(call=>call.name).join(',') !== 'ai_admit_execution,ai_authorize_execution_attempt,ai_settle_execution,ai_prepare_execution_result') {
    throw new Error('one admission, first dispatch authorization, settlement and final check are required; SQL tests separately pin no duplicate quota charge');
  }
});

Deno.test('missing or failed quota RPC fails closed before provider traffic', async () => {
  let generateCount = 0;
  const client = fakeClient({ begin: { data: null, error: new Error('quota RPC unavailable') } });
  const handler = createAiProxyHandler({
    createUserClient: () => client,
    createServiceClient: () => client,
    generate: async () => { generateCount++; return { suggestions: ['one'] }; },
  });
  const response = await handler(new Request('https://local.test/ai', {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ action: 'easy-versions', habitName: 'Read' }),
  }));
  if (response.status !== 503 || generateCount !== 0) {
    throw new Error('missing quota infrastructure must return a safe 503 before provider access');
  }
});

Deno.test('an exhausted account quota returns 429 without provider traffic', async () => {
  let generateCount = 0;
  const client = fakeClient({ begin: { data: { allowed: false, reason: 'user_limit' }, error: null } });
  const handler = createAiProxyHandler({
    createUserClient: () => client,
    createServiceClient: () => client,
    generate: async () => { generateCount++; return { suggestions: ['one'] }; },
  });
  const response = await handler(new Request('https://local.test/ai', {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ action: 'easy-versions', habitName: 'Read' }),
  }));
  if (response.status !== 429 || generateCount !== 0) {
    throw new Error('a denied logical reservation must not reach Gemini');
  }
});

Deno.test('each retry reserves its own provider attempt before fetch', async () => {
  const observed: string[] = [];
  const client = fakeClient({ onRpc: name => observed.push(name) });
  let providerCalls = 0;
  const handler = createAiProxyHandler({
    createUserClient: () => client,
    createServiceClient: () => client,
    generate: async (_action, _payload, reserveAttempt) => {
      providerCalls++;
      if (!await reserveAttempt(2)) throw new Error('attempt limit');
      providerCalls++;
      return { suggestions: ['one'] };
    },
  });
  await handler(new Request('https://local.test/ai', {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ action: 'easy-versions', habitName: 'Read' }),
  }));
  if (providerCalls !== 2 || observed.join(',') !== 'ai_admit_execution,ai_authorize_execution_attempt,ai_authorize_execution_attempt,ai_settle_execution,ai_prepare_execution_result') {
    throw new Error(`expected admission plus first/retry dispatch permissions and local settlement; got ${observed.join(',')}`);
  }
});

// A throw outside the handler's own guarded steps used to escape as a bare text/plain 500 with no CORS
// headers, which a browser reports only as "Failed to send a request to the Edge Function".
Deno.test('an unexpected throw still answers JSON with CORS headers instead of escaping', async () => {
  const client = fakeClient();
  const originalError = console.error;
  const logged: unknown[][] = [];
  console.error = (...args: unknown[]) => { logged.push(args); };
  try {
    const handler = createAiProxyHandler({
      createUserClient: () => client,
      createServiceClient: () => client,
      generate: async () => ({ suggestions: ['one'] }),
      corsHeaders: origin => ({ 'Access-Control-Allow-Origin': origin ?? '' }),
      clock: {
        now: Date.now,
        setTimeout: (() => { throw new Error('timers unavailable'); }) as unknown as typeof globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
      },
    });
    const response = await handler(new Request('https://local.test/ai', {
      method: 'POST',
      headers: { ...authHeaders, Origin: 'http://localhost:5173' },
      body: JSON.stringify({ action: 'easy-versions', habitName: 'Read' }),
    }));
    const body = await response.json();
    if (response.status !== 503 || typeof body.error !== 'string') {
      throw new Error(`expected a JSON 503, got status=${response.status} body=${JSON.stringify(body)}`);
    }
    if (response.headers.get('Access-Control-Allow-Origin') !== 'http://localhost:5173') {
      throw new Error('the failure response must carry CORS headers so the browser can read it');
    }
    if (!response.headers.get('Content-Type')?.includes('application/json')) {
      throw new Error('the failure response must be JSON');
    }
    if (!logged.some(args => String(args[1] ?? args[0]).includes('timers unavailable'))) {
      throw new Error('the underlying error must reach the function logs');
    }
  } finally {
    console.error = originalError;
  }
});

Deno.test('a failing CORS builder cannot turn the failure response into an unhandled throw', async () => {
  const client = fakeClient();
  const originalError = console.error;
  console.error = () => {};
  try {
    const handler = createAiProxyHandler({
      createUserClient: () => client,
      createServiceClient: () => client,
      generate: async () => ({ suggestions: ['one'] }),
      corsHeaders: () => { throw new Error('cors broke'); },
    });
    const response = await handler(new Request('https://local.test/ai', {
      method: 'POST', headers: authHeaders, body: JSON.stringify({ action: 'easy-versions', habitName: 'Read' }),
    }));
    if (response.status !== 503) throw new Error(`expected 503, got ${response.status}`);
  } finally {
    console.error = originalError;
  }
});

// The Supabase Edge runtime's setTimeout/clearTimeout throw "Illegal invocation" when called as a method of another
// object, which is exactly how the default clock used them (`clock.setTimeout(...)`). Local Deno does not check, so
// emulate the runtime and run the handler with its default clock.
Deno.test('the default clock works on a runtime whose timers reject a foreign `this`', async () => {
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const guard = (name: string) => (target: unknown) => {
    if (target !== undefined && target !== globalThis) throw new TypeError(`Illegal invocation (${name})`);
  };
  const checkSet = guard('setTimeout');
  const checkClear = guard('clearTimeout');
  globalThis.setTimeout = function (this: unknown, ...args: unknown[]) {
    checkSet(this);
    return (realSet as unknown as (...a: unknown[]) => number)(...args);
  } as unknown as typeof globalThis.setTimeout;
  globalThis.clearTimeout = function (this: unknown, ...args: unknown[]) {
    checkClear(this);
    return (realClear as unknown as (...a: unknown[]) => void)(...args);
  } as unknown as typeof globalThis.clearTimeout;
  try {
    const client = fakeClient();
    const handler = createAiProxyHandler({
      createUserClient: () => client,
      createServiceClient: () => client,
      generate: async () => ({ suggestions: ['one', 'two', 'three'] }),
    });
    const response = await handler(new Request('https://local.test/ai', {
      method: 'POST', headers: authHeaders, body: JSON.stringify({ action: 'easy-versions', habitName: 'Read' }),
    }));
    if (response.status !== 200) throw new Error(`expected 200 from the default clock, got ${response.status}`);
  } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
});

Deno.test('exhaustedProviders from the begin RPC reach the generator as plain strings; a missing field means none', async () => {
  const seen: Array<string[] | undefined> = [];
  for (const begin of [
    { allowed: true, ageVersion: 1, requestClass: 'suggestion', attemptNumber: 1, exhaustedProviders: ['groq', 7, null, 'cerebras'] },
    { allowed: true, ageVersion: 1, requestClass: 'suggestion', attemptNumber: 1 },
    { allowed: true, ageVersion: 1, requestClass: 'suggestion', attemptNumber: 1, exhaustedProviders: 'groq' },
  ]) {
    const client = fakeClient({ begin: { data: begin, error: null } });
    const handler = createAiProxyHandler({
      createUserClient: () => client,
      createServiceClient: () => client,
      generate: async (_action, _payload, _reserve, context) => {
        seen.push(context.exhaustedProviders);
        return { suggestions: ['a b', 'c d', 'e f'] };
      },
    });
    const response = await handler(new Request('https://local.test/ai', {
      method: 'POST', headers: authHeaders, body: JSON.stringify({ action: 'easy-versions', habitName: 'Read' }),
    }));
    if (response.status !== 200) throw new Error(`expected 200, got ${response.status}`);
  }
  if (JSON.stringify(seen) !== JSON.stringify([['groq', 'cerebras'], [], []])) {
    throw new Error(`unexpected exhausted lists ${JSON.stringify(seen)}`);
  }
});

Deno.test('markProviderExhausted calls the RPC with the request id, provider and zone; an RPC error never fails the request', async () => {
  const observed: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = fakeClient({ onRpc: (name, args) => observed.push({ name, args }) });
  const handler = createAiProxyHandler({
    createUserClient: () => client,
    createServiceClient: () => client,
    requestId: () => 'request-xyz',
    generate: async (_action, _payload, _reserve, context) => {
      await context.markProviderExhausted?.('groq', 'UTC');
      return { suggestions: ['a b', 'c d', 'e f'] };
    },
  });
  const response = await handler(new Request('https://local.test/ai', {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ action: 'easy-versions', habitName: 'Read' }),
  }));
  const mark = observed.find(call => call.name === 'ai_mark_provider_exhausted');
  if (response.status !== 200) throw new Error('a failing mark RPC (fakeClient answers with an error) must not fail the request');
  if (!mark || mark.args.p_request_id !== 'request-xyz' || mark.args.p_provider !== 'groq' || mark.args.p_reset_time_zone !== 'UTC') {
    throw new Error(`unexpected mark call ${JSON.stringify(mark)}`);
  }
});

Deno.test('a generator error of kind exhausted answers 503 with the capacity message', async () => {
  const client = fakeClient();
  const handler = createAiProxyHandler({
    createUserClient: () => client,
    createServiceClient: () => client,
    generate: async () => { throw Object.assign(new Error('all providers exhausted'), { kind: 'exhausted' }); },
  });
  const response = await handler(new Request('https://local.test/ai', {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ action: 'easy-versions', habitName: 'Read' }),
  }));
  const body = await response.json();
  if (response.status !== 503 || !/used up for today/i.test(body.error)) {
    throw new Error(`expected the capacity 503, got ${response.status} ${JSON.stringify(body)}`);
  }
});
