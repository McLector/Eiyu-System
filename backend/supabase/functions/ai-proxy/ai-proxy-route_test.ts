import {admittedFixtureData, canonicalWeekFixture} from './test-helpers/admission.ts';
import { createGroqOnlyHandler } from './ai-proxy-route.ts';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const approved = { name: 'groq', kind: 'openai', baseUrl: 'https://api.groq.com/openai/v1',
  model: 'openai/gpt-oss-20b', keyEnv: 'GROQ_API_KEY' };
const weekly = { action: 'weekly-summary', processingAccess: {contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0}, weekStart: '2026-10-05' };
function fixture(raw: string | undefined = JSON.stringify([approved]), options: {
  absentConfiguration?: boolean; missingAgeRevision?: boolean; missingMailboxRevision?: boolean; exhaustedProviders?: string[]; key?: string; response?: () => Response; beginError?: unknown; finalAllowed?: boolean;
} = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const rpcs: string[] = [];
  const envReads: string[] = [];
  const logs: string[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'synthetic-owner' } }, error: null }) },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push(name);
      if (name === 'ai_tracker_week_input') return { data: canonicalWeekFixture, error: null };
      if (name === 'ai_admit_execution') return { data: admittedFixtureData({ allowed: true, attemptNumber: 1,
        ageVersion: options.missingAgeRevision ? undefined : 1, mailboxVersion: options.missingMailboxRevision ? undefined : 1,
        consentVersion: 2, authorityVersion: 0, exhaustedProviders: options.exhaustedProviders },args), error: options.beginError ?? null };
      if (name === 'ai_prepare_execution_result') return options.finalAllowed===false?{data:null,error:{code:'EP002'}}:{data:true,error:null};
      return { data: true, error: null };
    },
  };
  const handler = createGroqOnlyHandler({ createUserClient: () => client, createServiceClient: () => client,
    requestId: () => 'synthetic-request' }, name => {
      envReads.push(name);
      if (name === 'AI_PROVIDERS') return options.absentConfiguration ? undefined : raw;
      if (name === 'GROQ_API_KEY') return options.key ?? 'synthetic-test-placeholder';
      return 'legacy-setting-must-not-be-used';
    }, {
      fetch: async (input, init) => {
        calls.push({ url: String(input), init });
        return options.response?.() ?? new Response(JSON.stringify({ choices: [{
          message: { content: 'A synthetic weekly review.' }, finish_reason: 'stop' }] }), { status: 200 });
      }, sleep: async () => {}, log: line => logs.push(line), random: () => 0,
    });
  return { calls, rpcs, envReads, logs, request: (body: unknown = weekly) => handler(new Request('https://local.test/ai', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic-token' }, body: JSON.stringify(body),
  })) };
}

const invalid: Array<[string, string | undefined]> = [
  ['missing', undefined], ['blank', ' '], ['malformed', '{'], ['empty', '[]'],
  ['legacy multi-provider', JSON.stringify([{ name: 'gemini', kind: 'gemini', model: 'legacy', keyEnv: 'GEMINI_API_KEY' }, approved])],
  ['valid entry plus rejected entry', JSON.stringify([approved, {}])],
  ['router', JSON.stringify([{ ...approved, baseUrl: 'https://openrouter.ai/api/v1' }])],
  ['lookalike host', JSON.stringify([{ ...approved, baseUrl: 'https://api.groq.com.example.invalid/openai/v1' }])],
  ['credentials in URL', JSON.stringify([{ ...approved, baseUrl: 'https://user:password@api.groq.com/openai/v1' }])],
  ['query', JSON.stringify([{ ...approved, baseUrl: 'https://api.groq.com/openai/v1?route=other' }])],
  ['fragment', JSON.stringify([{ ...approved, baseUrl: 'https://api.groq.com/openai/v1#other' }])],
  ['wrong path', JSON.stringify([{ ...approved, baseUrl: 'https://api.groq.com/other' }])],
  ['wrong model', JSON.stringify([{ ...approved, model: 'openai/gpt-oss-120b' }])],
  ['wrong key reference', JSON.stringify([{ ...approved, keyEnv: 'OPENROUTER_API_KEY' }])],
  ['wrong kind', JSON.stringify([{ ...approved, kind: 'gemini' }])],
  ['wrong name', JSON.stringify([{ ...approved, name: 'other' }])],
  ['inline credential field', JSON.stringify([{ ...approved, apiKey: 'synthetic-inline-placeholder' }])],
  ['unapproved reset override', JSON.stringify([{ ...approved, resetTimeZone: 'Asia/Manila' }])],
];
for (const [label, raw] of invalid) {
  Deno.test(`Groq-only route rejects ${label} before quota or provider traffic`, async () => {
    const f = fixture(raw, { absentConfiguration: label === 'missing' });
    const result = await f.request();
    assert(result.status === 503, `${label} must be unavailable`);
    assert(f.calls.length === 0 && f.rpcs.length === 0, 'invalid route must not spend or fetch');
    assert(!f.envReads.some(name => name === 'GEMINI_API_KEY' || name === 'OPENROUTER_API_KEY'), 'no legacy key lookup');
    assert(!f.logs.some(line => line.includes('synthetic-inline-placeholder') || line.includes('user:password')), 'logs must not expose values');
  });
}
Deno.test('Groq-only route sends weekly content solely to the approved model and refuses redirects', async () => {
  const f = fixture();
  const response = await f.request();
  assert(response.status === 200 && (await response.json()).summary === 'A synthetic weekly review.', 'approved weekly response');
  assert(f.calls.length === 1 && f.calls[0].url === 'https://api.groq.com/openai/v1/chat/completions', 'direct Groq only');
  const body = JSON.parse(String(f.calls[0].init?.body));
  assert(body.model === 'openai/gpt-oss-20b' && body.service_tier === undefined, 'selected model without paid tier override');
  assert(f.calls[0].init?.redirect === 'error', 'do not follow redirects with habit content');
});
Deno.test('Groq-only route accepts a trailing slash and explicit UTC reset', async () => {
  const f = fixture(JSON.stringify([{ ...approved, baseUrl: approved.baseUrl + '/', resetTimeZone: 'UTC' }]));
  assert((await f.request()).status === 200, 'canonical trailing slash accepted');
  assert(f.calls[0].url === 'https://api.groq.com/openai/v1/chat/completions', 'canonical request path');
});
Deno.test('Groq-only route fails closed without its key even when legacy keys exist', async () => {
  const f = fixture(undefined, { key: ' ' });
  assert((await f.request()).status === 503 && !f.calls.length && !f.rpcs.length, 'missing key denies before spend');
});
for (const body of [{ action: 'stage-breakdown', questName: 'Read', stat: 'INT' },
  { action: 'easy-versions', habitName: 'Read', stat: 'INT' }]) {
  Deno.test(`production route denies obsolete ${body.action} before spending`, async () => {
    const f = fixture();
    assert((await f.request(body)).status === 400 && !f.rpcs.length && !f.calls.length, 'only weekly review may call AI');
  });
}
for (const message of ['Rate limit reached for tokens per minute (TPM)', 'Daily request limit reached', 'Quota exceeded']) {
  Deno.test(`Groq 429 returns retry-later without retry, fallback or assumed midnight reset: ${message}`, async () => {
    const f = fixture(undefined, { response: () => new Response(JSON.stringify({ error: { message, type: 'tokens', code: 'rate_limit_exceeded' } }),
      { status: 429, headers: { 'retry-after': '120' } }) });
    const response = await f.request();
    const text = await response.text();
    assert(response.status === 503 && response.headers.get('retry-after') === '120', 'respect bounded retry-after');
    assert(text.includes('free AI capacity') && !text.includes('tomorrow') && !text.includes(message), 'generic free-quota explanation without raw provider data');
    assert(f.calls.length === 1 && f.rpcs.filter(name => name === 'ai_release_request').length === 1, 'one attempt, refund failed logical request');
    assert(!f.rpcs.includes('ai_mark_provider_exhausted'), 'do not invent a Groq midnight reset');
    assert(!f.rpcs.some(name => name.includes('weekly_summary') || name.includes('delete')), 'saved content untouched');
  });
}
Deno.test('invalid Groq retry-after uses a bounded default', async () => {
  const f = fixture(undefined, { response: () => new Response('{}', { status: 429, headers: { 'retry-after': '-1' } }) });
  const response = await f.request();
  assert(response.status === 503 && response.headers.get('retry-after') === '60', 'invalid retry interval defaults to 60 seconds');
});
Deno.test('Groq transient failure retries only the same approved provider', async () => {
  const f = fixture(undefined, { response: () => new Response('{}', { status: 503 }) });
  assert((await f.request()).status === 503, 'failure remains unavailable');
  assert(f.calls.length === 2 && f.calls.every(call => call.url === 'https://api.groq.com/openai/v1/chat/completions'), 'bounded same-provider retry only');
});
for (const code of ['EA001', 'EM001']) {
  Deno.test(`Groq-only route retains server eligibility denial ${code}`, async () => {
    const f = fixture(undefined, { beginError: { code } });
    assert((await f.request()).status === 403 && !f.calls.length, 'deny before provider');
  });
}
Deno.test('Groq result is discarded when the birthday/mailbox revision changes', async () => {
  const f = fixture(undefined, { finalAllowed: false });
  const response = await f.request();
  assert(response.status === 403 && !(await response.text()).includes('synthetic weekly review'), 'discard stale private result');
  assert(f.rpcs.includes('ai_release_request'), 'failed result releases logical allowance');
});

Deno.test('carried-over provider exhaustion stays fail closed without claiming a Groq reset time', async () => {
  const f = fixture(undefined, { exhaustedProviders: ['groq'] });
  const response = await f.request();
  assert(response.status === 503 && response.headers.get('retry-after') === '60', 'generic retry-later for prior marker');
  assert(!(await response.text()).includes('tomorrow'), 'old provider-name marker does not prove new model reset');
  assert(!f.calls.length && f.rpcs.includes('ai_release_request'), 'honor stored exhaustion, refund failed logical request');
});

Deno.test('Groq 429 headers stop retries even when the provider body cannot be read', async () => {
  const f = fixture(undefined, { response: () => new Response(new ReadableStream({
    start(controller) { controller.error(new Error('synthetic body transport failure')); },
  }), { status: 429, headers: { 'retry-after': '120' } }) });
  const response = await f.request();
  assert(response.status === 503 && response.headers.get('retry-after') === '120', '429 response headers are sufficient');
  assert(f.calls.length === 1 && f.rpcs.includes('ai_release_request'), 'no 429 retry despite body failure');
});

for (const missing of ['age', 'mailbox']) {
  Deno.test(`older quota result missing ${missing} revision fails closed and refunds its accepted reservation`, async () => {
    const f = fixture(undefined, { missingAgeRevision: missing === 'age', missingMailboxRevision: missing === 'mailbox' });
    assert((await f.request()).status === 503 && !f.calls.length, 'unknown eligibility fails before provider');
    assert(f.rpcs.filter(name => name === 'ai_release_request').length === 1, 'release known accepted reservation');
  });
}

