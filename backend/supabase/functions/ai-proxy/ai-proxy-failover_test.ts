import { createFailoverGenerator, createGeminiGenerator } from './ai-proxy-generator.ts';
import type { AiPayload, AiRequestContext, ProviderAttemptReservation } from './ai-proxy-core.ts';
import type { Provider } from './ai-proxy-providers.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function respond(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const geminiOk = (values: unknown[]) => respond(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(values) }] }, finishReason: 'STOP' }] });
const openaiOk = (content: string, finish = 'stop') => respond(200, { choices: [{ message: { content }, finish_reason: finish }] });
const THREE = ['walk two minutes', 'read one page', 'stretch briefly'];

const provider = (name: string, kind: 'gemini' | 'openai' = 'openai', extra: Partial<Provider> = {}): Provider => ({
  name,
  kind,
  baseUrl: kind === 'gemini' ? 'https://gemini.test/v1beta/models' : `https://${name}.test/v1`,
  model: `${name}-model`,
  keyEnv: `${name.toUpperCase()}_KEY`,
  resetTimeZone: kind === 'gemini' ? 'America/Los_Angeles' : 'UTC',
  ...extra,
});

type Harness = {
  context: AiRequestContext;
  reserve: ProviderAttemptReservation;
  reserved: number[];
  marks: Array<{ provider: string; zone: string }>;
  delays: number[];
  logs: string[];
  calls: Array<{ url: string; init: RequestInit }>;
};

function harness(options: { exhausted?: string[]; markThrows?: boolean; denyAt?: number; controller?: AbortController } = {}): Harness {
  const controller = options.controller ?? new AbortController();
  const marks: Harness['marks'] = [];
  const reserved: number[] = [];
  return {
    reserved,
    marks,
    delays: [],
    logs: [],
    calls: [],
    reserve: async attempt => {
      if (options.denyAt === attempt) return false;
      reserved.push(attempt);
      return true;
    },
    context: {
      signal: controller.signal,
      deadlineAt: 1_000 + 16_000,
      now: () => 1_000,
      exhaustedProviders: options.exhausted ?? [],
      markProviderExhausted: async (name, zone) => {
        if (options.markThrows) throw new Error('mark RPC down');
        marks.push({ provider: name, zone });
      },
    },
  };
}

function build(
  providers: Provider[],
  h: Harness,
  responder: (name: string, call: number) => Response | Promise<Response>,
  keys: Record<string, string | undefined> = {},
) {
  const perProviderCalls: Record<string, number> = {};
  return createFailoverGenerator({
    providers,
    getKey: keyEnv => keyEnv in keys ? keys[keyEnv] : `secret-for-${keyEnv}`,
    random: () => 0,
    sleep: async ms => { h.delays.push(ms); },
    log: line => h.logs.push(line),
    fetch: async (input, init) => {
      const url = String(input);
      h.calls.push({ url, init: init ?? {} });
      const name = providers.find(p => url.startsWith(p.baseUrl))?.name ?? 'unknown';
      perProviderCalls[name] = (perProviderCalls[name] ?? 0) + 1;
      return await responder(name, perProviderCalls[name]);
    },
  });
}

const easy: AiPayload = { action: 'easy-versions', habitName: 'Run five kilometres', stat: 'STR' };
const weekly: AiPayload = {
  action: 'weekly-summary',
  weekStart: '2026-10-05',
  habits: [{ name: 'Run', stat: 'STR', fullCount: 3, easyCount: 1 }],
  statTotals: { STR: 4 },
};

async function failure(run: () => Promise<unknown>): Promise<Error & { kind?: string }> {
  try {
    await run();
  } catch (error) {
    return error as Error & { kind?: string };
  }
  throw new Error('expected the generator to reject');
}

const geminiDaily429 = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'You exceeded your current quota.', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } };
const geminiMinute429 = { error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }] } };
const groqDaily429 = { error: { message: 'Rate limit reached for model in organization on requests per day (RPD): Limit 1000, Used 1000.', type: 'requests', code: 'rate_limit_exceeded' } };
const openrouterDaily429 = { error: { message: 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', code: 429 } };

Deno.test('an openai-kind provider gets a chat/completions request with a bearer key and no response_format', async () => {
  const h = harness();
  const generate = build([provider('groq')], h, () => openaiOk(JSON.stringify(THREE)));
  const result = await generate('easy-versions', easy, h.reserve, h.context);
  assert(JSON.stringify(result) === JSON.stringify({ suggestions: THREE }), 'the suggestions contract is preserved');
  const call = h.calls[0];
  assert(call.url === 'https://groq.test/v1/chat/completions', `unexpected url ${call.url}`);
  const headers = call.init.headers as Record<string, string>;
  assert(headers.Authorization === 'Bearer secret-for-GROQ_KEY', 'the key goes in a bearer header');
  const body = JSON.parse(String(call.init.body));
  assert(body.model === 'groq-model' && body.messages[0].role === 'system' && body.messages[1].role === 'user', 'system + user messages with the configured model');
  assert(!('response_format' in body), 'not every free host supports response_format');
  assert(typeof body.max_tokens === 'number' && body.max_tokens <= 1024, 'output is bounded');
  assert(/JSON array/i.test(body.messages[0].content), 'the array prompt asks for a bare JSON array');
  assert(!call.url.includes('secret-for'), 'the key never travels in the url');
});

Deno.test('a gemini-kind provider keeps the Gemini request shape and key header', async () => {
  const h = harness();
  const generate = build([provider('gem', 'gemini')], h, () => geminiOk(THREE));
  const result = await generate('easy-versions', easy, h.reserve, h.context);
  assert(JSON.stringify(result) === JSON.stringify({ suggestions: THREE }), 'contract preserved');
  assert(h.calls[0].url === 'https://gemini.test/v1beta/models/gem-model:generateContent', h.calls[0].url);
  assert((h.calls[0].init.headers as Record<string, string>)['x-goog-api-key'] === 'secret-for-GEM_KEY', 'Gemini key header');
});

Deno.test('openai output is cleaned of a code fence and of a leading think block before validation', async () => {
  for (const content of [
    '```json\n' + JSON.stringify(THREE) + '\n```',
    '<think>let me plan three options\nwalk first</think>\n' + JSON.stringify(THREE),
    '<think>x</think>```json\n' + JSON.stringify(THREE) + '```',
  ]) {
    const h = harness();
    const generate = build([provider('groq')], h, () => openaiOk(content));
    const result = await generate('easy-versions', easy, h.reserve, h.context);
    assert(JSON.stringify(result) === JSON.stringify({ suggestions: THREE }), `failed to clean: ${content.slice(0, 30)}`);
  }
});

Deno.test('openai text output: think block stripped, truncation by finish_reason length is rejected', async () => {
  const h = harness();
  const generate = build([provider('groq')], h, () => openaiOk('<think>reasoning</think>You kept a steady rhythm this week.'));
  const result = await generate('weekly-summary', weekly, h.reserve, h.context);
  assert((result as { summary: string }).summary === 'You kept a steady rhythm this week.', 'paragraph only');

  const h2 = harness();
  const truncated = build([provider('groq')], h2, () => openaiOk('You kept a steady rhythm and then', 'length'));
  const error = await failure(() => truncated('weekly-summary', weekly, h2.reserve, h2.context));
  assert(error.name === 'GeminiProviderError', 'a truncated paragraph is never returned');
});

Deno.test('an unclosed think block or a blank answer is malformed output', async () => {
  for (const content of ['<think>never closed ' + JSON.stringify(THREE), '   ', '[]', '["one","two"]', 'sure! here you go']) {
    const h = harness();
    const generate = build([provider('groq')], h, () => openaiOk(content));
    await failure(() => generate('easy-versions', easy, h.reserve, h.context));
  }
});

Deno.test('a transient failure moves breadth-first to the next provider without waiting', async () => {
  const h = harness();
  const order: string[] = [];
  const generate = build([provider('a'), provider('b'), provider('c')], h, name => {
    order.push(name);
    return name === 'c' ? openaiOk(JSON.stringify(THREE)) : respond(503, { error: 'busy' });
  });
  const result = await generate('easy-versions', easy, h.reserve, h.context);
  assert(JSON.stringify(result) === JSON.stringify({ suggestions: THREE }), 'third provider answers');
  assert(order.join() === 'a,b,c', `breadth-first order, got ${order.join()}`);
  assert(h.delays.length === 0, 'no backoff when another provider is untried');
  assert(h.reserved.join() === '1,2,3', 'one reserved slot per attempt');
});

Deno.test('when every provider failed transiently once, failed ones are retried with bounded backoff', async () => {
  const h = harness();
  const order: string[] = [];
  const generate = build([provider('a'), provider('b')], h, (name, call) => {
    order.push(`${name}${call}`);
    return name === 'a' && call === 2 ? openaiOk(JSON.stringify(THREE)) : respond(503, {});
  });
  const result = await generate('easy-versions', easy, h.reserve, h.context);
  assert(JSON.stringify(result) === JSON.stringify({ suggestions: THREE }), 'the second pass can succeed');
  assert(order.join() === 'a1,b1,a2', `got ${order.join()}`);
  assert(h.delays.length === 1 && h.delays[0] >= 250 && h.delays[0] <= 350, `one backoff before the retry, got ${h.delays}`);
});

Deno.test('never more than four provider attempts, however many providers are configured', async () => {
  for (const count of [2, 3, 5, 8]) {
    const h = harness();
    const providers = Array.from({ length: count }, (_, index) => provider(`p${index}`));
    const generate = build(providers, h, () => respond(503, {}));
    const error = await failure(() => generate('easy-versions', easy, h.reserve, h.context));
    assert(h.calls.length === 4, `${count} providers made ${h.calls.length} fetches`);
    assert(error.kind === 'busy', 'all-transient failure is reported as busy');
    assert(h.delays.every(ms => ms <= 600), 'backoff stays bounded');
  }
});

Deno.test('a daily-quota 429 marks the provider with its reset zone, skips backoff, and fails over', async () => {
  for (const [daily, kind] of [[geminiDaily429, 'gemini'], [groqDaily429, 'openai'], [openrouterDaily429, 'openai']] as const) {
    const h = harness();
    const generate = build([provider('first', kind), provider('second')], h, name =>
      name === 'first' ? respond(429, daily) : openaiOk(JSON.stringify(THREE)));
    const result = await generate('easy-versions', easy, h.reserve, h.context);
    assert(JSON.stringify(result) === JSON.stringify({ suggestions: THREE }), 'second provider answers');
    assert(h.marks.length === 1 && h.marks[0].provider === 'first', 'the exhausted provider is marked');
    assert(h.marks[0].zone === (kind === 'gemini' ? 'America/Los_Angeles' : 'UTC'), `zone ${h.marks[0].zone}`);
    assert(h.delays.length === 0, 'no backoff after a daily quota');
  }
});

Deno.test('a camelCase per-minute 429 is transient: not marked, retried after the other providers', async () => {
  const h = harness();
  const order: string[] = [];
  const generate = build([provider('a', 'gemini'), provider('b')], h, (name, call) => {
    order.push(`${name}${call}`);
    if (name === 'a' && call === 1) return respond(429, geminiMinute429);
    return name === 'b' ? respond(503, {}) : geminiOk(THREE);
  });
  const result = await generate('easy-versions', easy, h.reserve, h.context);
  assert(JSON.stringify(result) === JSON.stringify({ suggestions: THREE }), 'a recovers on the retry');
  assert(h.marks.length === 0, 'a per-minute limit is not a daily exhaustion');
  assert(order.join() === 'a1,b1,a2', order.join());
});

Deno.test('unclassified 429, auth failures, bad requests and malformed output each go to the next provider unmarked', async () => {
  const bad: Array<() => Response> = [
    () => respond(429, { error: 'slow down' }),
    () => respond(401, { error: 'bad key' }),
    () => respond(402, { error: 'pay up' }),
    () => respond(403, { error: 'forbidden' }),
    () => respond(400, { error: 'bad model' }),
    () => respond(404, { error: 'no such model' }),
    () => respond(200, 'not json at all'),
    () => openaiOk('nonsense'),
  ];
  for (const makeBad of bad) {
    const h = harness();
    const order: string[] = [];
    const generate = build([provider('a'), provider('b')], h, name => {
      order.push(name);
      return name === 'a' ? makeBad() : openaiOk(JSON.stringify(THREE));
    });
    const result = await generate('easy-versions', easy, h.reserve, h.context);
    assert(JSON.stringify(result) === JSON.stringify({ suggestions: THREE }), 'b answers');
    assert(order.join() === 'a,b', `a is not retried, got ${order.join()}`);
    assert(h.marks.length === 0, 'nothing is marked');
    assert(h.delays.length === 0, 'no backoff for a non-transient failure');
  }
});

Deno.test('a rejected key is logged by provider name and status only', async () => {
  const h = harness();
  const generate = build([provider('a'), provider('b')], h, name => name === 'a' ? respond(401, { error: 'bad key secret-for-A_KEY' }) : openaiOk(JSON.stringify(THREE)));
  await generate('easy-versions', easy, h.reserve, h.context);
  assert(h.logs.some(line => line.includes('a') && line.includes('401')), 'status is logged');
  const everything = h.logs.join('\n');
  assert(!everything.includes('secret-for') && !everything.includes('Run five kilometres') && !everything.includes('bad key'), 'no key, prompt or provider body in logs');
});

Deno.test('providers the database reports as exhausted are skipped and cost no attempt', async () => {
  const h = harness({ exhausted: ['a'] });
  const order: string[] = [];
  const generate = build([provider('a'), provider('b')], h, name => {
    order.push(name);
    return openaiOk(JSON.stringify(THREE));
  });
  await generate('easy-versions', easy, h.reserve, h.context);
  assert(order.join() === 'b', 'only b is called');
  assert(h.reserved.join() === '1', 'the first provider slot goes to b');
});

Deno.test('when every provider is exhausted the error says so and nothing is fetched or reserved', async () => {
  const h = harness({ exhausted: ['a', 'b'] });
  const generate = build([provider('a'), provider('b')], h, () => openaiOk(JSON.stringify(THREE)));
  const error = await failure(() => generate('easy-versions', easy, h.reserve, h.context));
  assert(error.kind === 'exhausted', `kind ${error.kind}`);
  assert(h.calls.length === 0 && h.reserved.length === 0, 'no provider traffic');
});

Deno.test('providers hitting a daily quota during the request end as exhausted, not busy', async () => {
  const h = harness();
  const generate = build([provider('a'), provider('b')], h, () => respond(429, groqDaily429));
  const error = await failure(() => generate('easy-versions', easy, h.reserve, h.context));
  assert(error.kind === 'exhausted', `kind ${error.kind}`);
  assert(h.marks.map(m => m.provider).join() === 'a,b', 'both are marked');
});

Deno.test('a provider with no key is skipped without an attempt; no keys at all is a plain failure', async () => {
  const h = harness();
  const order: string[] = [];
  const generate = build([provider('a'), provider('b')], h, name => {
    order.push(name);
    return openaiOk(JSON.stringify(THREE));
  }, { A_KEY: undefined });
  await generate('easy-versions', easy, h.reserve, h.context);
  assert(order.join() === 'b' && h.reserved.join() === '1', 'a is skipped for free');

  const h2 = harness();
  const none = build([provider('a'), provider('b')], h2, () => openaiOk('[]'), { A_KEY: '', B_KEY: undefined });
  const error = await failure(() => none('easy-versions', easy, h2.reserve, h2.context));
  assert(error.kind !== 'exhausted' && error.kind !== 'busy', 'a configuration problem is not a capacity message');
  assert(h2.calls.length === 0, 'nothing fetched');
});

Deno.test('a failing mark RPC never fails the request', async () => {
  const h = harness({ markThrows: true });
  const generate = build([provider('a'), provider('b')], h, name => name === 'a' ? respond(429, groqDaily429) : openaiOk(JSON.stringify(THREE)));
  const result = await generate('easy-versions', easy, h.reserve, h.context);
  assert(JSON.stringify(result) === JSON.stringify({ suggestions: THREE }), 'b still answers');
});

Deno.test('the same generator remembers a quota exhaustion in memory even if the database list is empty', async () => {
  const h = harness();
  const order: string[] = [];
  const generate = build([provider('a'), provider('b')], h, name => {
    order.push(name);
    return name === 'a' ? respond(429, groqDaily429) : openaiOk(JSON.stringify(THREE));
  });
  await generate('easy-versions', easy, h.reserve, h.context);
  order.length = 0;
  const h2 = harness();
  await generate('easy-versions', easy, h2.reserve, h2.context);
  assert(order.join() === 'b', `a must be skipped from memory, got ${order.join()}`);
});

Deno.test('a denied provider-attempt reservation stops the request before any fetch for that attempt', async () => {
  const h = harness({ denyAt: 2 });
  const generate = build([provider('a'), provider('b'), provider('c')], h, () => respond(503, {}));
  await failure(() => generate('easy-versions', easy, h.reserve, h.context));
  assert(h.calls.length === 1, `only attempt 1 may fetch, saw ${h.calls.length}`);
});

Deno.test('a cancelled request stops immediately and a spent deadline is busy', async () => {
  const controller = new AbortController();
  controller.abort();
  const h = harness({ controller });
  const generate = build([provider('a')], h, () => openaiOk(JSON.stringify(THREE)));
  const cancelled = await failure(() => generate('easy-versions', easy, h.reserve, h.context));
  assert(cancelled.name === 'GeminiRequestCancelledError', cancelled.name);
  assert(h.calls.length === 0, 'no fetch');

  const h2 = harness();
  h2.context.now = () => 1_000 + 16_000;
  const expired = await failure(() => generate('easy-versions', easy, h2.reserve, h2.context));
  assert(expired.kind === 'busy', 'a spent deadline is busy');
});

Deno.test('a hanging provider is aborted at the per-attempt timeout and the next provider is tried', async () => {
  const h = harness();
  const generate = createFailoverGenerator({
    providers: [provider('a'), provider('b')],
    getKey: () => 'k',
    attemptTimeoutMs: 20,
    random: () => 0,
    sleep: async () => {},
    log: () => {},
    fetch: (input, init) => {
      if (String(input).startsWith('https://a.test')) {
        return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      }
      return Promise.resolve(openaiOk(JSON.stringify(THREE)));
    },
  });
  const result = await generate('easy-versions', easy, h.reserve, { ...h.context, now: () => Date.now(), deadlineAt: Date.now() + 5_000 });
  assert(JSON.stringify(result) === JSON.stringify({ suggestions: THREE }), 'b answers after a times out');
});

Deno.test('the legacy generator now treats a camelCase per-minute 429 as transient but a per-day one as final', async () => {
  const run = async (body: unknown) => {
    let calls = 0;
    const generate = createGeminiGenerator({
      apiKey: 'k',
      primaryModel: 'p',
      fallbackModel: 'f',
      retryEnabled: true,
      random: () => 0,
      sleep: async () => {},
      fetch: async () => { calls++; return calls === 1 ? respond(429, body) : geminiOk(THREE); },
    });
    const h = harness();
    try {
      await generate('easy-versions', easy, h.reserve, h.context);
      return { calls, ok: true };
    } catch {
      return { calls, ok: false };
    }
  };
  const minute = await run(geminiMinute429);
  assert(minute.ok && minute.calls === 2, 'PerMinute is retried');
  const day = await run({ error: { details: [{ violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }, { quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } });
  assert(!day.ok && day.calls === 1, 'a body that also names the daily quota fails closed');
});
