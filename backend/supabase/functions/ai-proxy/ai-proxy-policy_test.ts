import {admittedFixtureData, canonicalWeekFixture} from './test-helpers/admission.ts';
import * as routes from './ai-proxy-route.ts';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const groq = { name: 'groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1',
  model: 'openai/gpt-oss-20b', keyEnv: 'GROQ_API_KEY' };
const gemini = { name: 'gemini', kind: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  model: 'gemini-3.6-flash', keyEnv: 'GEMINI_API_KEY' };

async function invoke(policy: string | undefined, providers: unknown[], status = 200, key = 'synthetic-key') {
  assert('createConfiguredAiHandler' in routes, 'explicit provider policy factory must exist');
  const calls: string[] = [], reads: string[] = [], rpcs: string[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'synthetic-owner' } }, error: null }) },
    rpc: async (name: string,args:Record<string,unknown>) => {
      if (name === 'ai_tracker_week_input') return {data: canonicalWeekFixture, error: null};
      rpcs.push(name);
      return { data: name === 'ai_admit_execution'
        ? admittedFixtureData({ allowed: true, attemptNumber: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0 },args)
        : true, error: null };
    },
  };
  const handler = routes.createConfiguredAiHandler({ createUserClient: () => client,
    createServiceClient: () => client, requestId: () => 'synthetic-policy-request' }, name => {
    reads.push(name);
    if (name === 'AI_PROVIDER_MODE') return policy;
    if (name === 'AI_PROVIDERS') return JSON.stringify(providers);
    return key;
  }, { fetch: async input => {
    calls.push(String(input));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Synthetic review.' }] },
      finishReason: 'STOP' }], choices: [{ message: { content: 'Synthetic review.' }, finish_reason: 'stop' }] }), { status });
  }, sleep: async () => {}, random: () => 0, log: () => {} });
  const response = await handler(new Request('https://local.test/ai', { method: 'POST',
    headers: { Authorization: 'Bearer synthetic-token' }, body: JSON.stringify({ action: 'weekly-summary', processingAccess: {contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0},
      weekStart: '2026-10-05' }) }));
  return { response, calls, reads, rpcs };
}

Deno.test('provider policy defaults to Groq only and never reads the Gemini key', async () => {
  const f = await invoke(undefined, [groq]);
  assert(f.response.status === 200 && f.calls.length === 1 && f.calls[0].startsWith(groq.baseUrl), 'default Groq route');
  assert(!f.reads.includes('GEMINI_API_KEY'), 'Gemini stays disabled');
});
Deno.test('Gemini is disabled even with explicit mode, exact singleton and an available key', async () => {
  const f = await invoke('gemini-only', [gemini]);
  assert(f.response.status === 503 && !f.calls.length && !f.rpcs.length, 'Gemini cannot be activated before quota or traffic');
  assert(!f.reads.includes('GEMINI_API_KEY') && !f.reads.includes('GROQ_API_KEY'), 'disabled mode reads no provider credential');
  for (const mode of [undefined, 'groq-only', '', 'legacy', 'GEMINI-ONLY']) {
    const denied = await invoke(mode, [gemini]);
    assert(denied.response.status === 503 && !denied.calls.length && !denied.rpcs.length, 'unapproved mode denies before quota');
  }
});
Deno.test('explicit Gemini mode rejects mixed lists, wrong model and mismatched Groq configuration', async () => {
  for (const list of [[gemini, groq], [groq], [{ ...gemini, model: 'unreviewed-model' }],
    [{ ...gemini, baseUrl: 'https://other.invalid' }], [{ ...gemini, keyEnv: 'GROQ_API_KEY' }]]) {
    const f = await invoke('gemini-only', list);
    assert(f.response.status === 503 && !f.calls.length && !f.rpcs.length, 'invalid Gemini configuration fails closed');
  }
});
Deno.test('disabled Gemini never reaches quota exhaustion or creates a logical reservation', async () => {
  const f = await invoke('gemini-only', [gemini], 429);
  assert(f.response.status === 503 && !f.calls.length && !f.rpcs.length, 'no Gemini request or quota reservation');
});
Deno.test('blank and unknown policies cannot silently select an otherwise valid Groq route', async () => {
  for (const mode of ['', 'legacy', 'gemini-only', 'GEMINI-ONLY', 'disabled']) {
    const f = await invoke(mode, [groq]);
    assert(f.response.status === 503 && !f.calls.length && !f.rpcs.length, 'invalid mode fails before quota');
  }
});
Deno.test('explicit Gemini mode without its key fails before quota', async () => {
  const f = await invoke('gemini-only', [gemini], 200, ' ');
  assert(f.response.status === 503 && !f.calls.length && !f.rpcs.length, 'missing Gemini credential denies');
});
Deno.test('disabled Gemini cannot make an initial or transient retry request', async () => {
  const f = await invoke('gemini-only', [gemini], 503);
  assert(f.response.status === 503 && !f.calls.length && !f.rpcs.length, 'no disabled-provider request or retry');
  assert(!f.reads.includes('GEMINI_API_KEY') && !f.reads.includes('GROQ_API_KEY'), 'no provider key lookup');
});

