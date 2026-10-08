import { createAiProxyHandler } from './ai-proxy-core.ts';
import type { AiProxyDependencies } from './ai-proxy-core.ts';

type RpcResponse = { data: unknown; error: unknown };
type Call = { name: string; args: Record<string, unknown> };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function setup(options: {
  begin?: RpcResponse;
  nextAttempt?: RpcResponse;
  release?: () => Promise<RpcResponse>;
  generate: AiProxyDependencies['generate'];
  totalRequestTimeoutMs?: number;
}) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'verified-user' } }, error: null }) },
    rpc: async (name: string, args: Record<string, unknown>): Promise<RpcResponse> => {
      calls.push({ name, args });
      if (name === 'ai_begin_request') {
        return options.begin ?? { data: { allowed: true, requestClass: 'suggestion', attemptNumber: 1 }, error: null };
      }
      if (name === 'ai_reserve_next_attempt') return options.nextAttempt ?? { data: true, error: null };
      if (name === 'ai_release_request') return options.release ? await options.release() : { data: true, error: null };
      return { data: null, error: new Error(`unexpected RPC ${name}`) };
    },
  };
  const handler = createAiProxyHandler({
    createUserClient: () => client,
    createServiceClient: () => client,
    generate: options.generate,
    requestId: () => 'request-refund',
    totalRequestTimeoutMs: options.totalRequestTimeoutMs,
  });
  const call = () => handler(new Request('https://local.test/ai', {
    method: 'POST',
    headers: { Authorization: 'Bearer disposable-test-token' },
    body: JSON.stringify({ action: 'easy-versions', habitName: 'Read' }),
  }));
  const refunds = () => calls.filter(c => c.name === 'ai_release_request');
  return { call, calls, logs, refunds };
}

function failure(kind: 'busy' | 'exhausted' | 'other'): Error {
  const error = new Error(`provider ${kind}`);
  if (kind !== 'other') (error as Error & { kind?: string }).kind = kind;
  return error;
}

async function withCapturedWarnings<T>(logs: string[], run: () => Promise<T>): Promise<T> {
  const original = console.warn;
  console.warn = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  try { return await run(); } finally { console.warn = original; }
}

for (const [kind, status] of [['busy', 503], ['exhausted', 503], ['other', 503]] as const) {
  Deno.test(`a ${kind} provider failure refunds the attempt exactly once`, async () => {
    const t = setup({ generate: async () => { throw failure(kind); } });
    const response = await t.call();
    assert(response.status === status, `expected ${status}, got ${response.status}`);
    assert(t.refunds().length === 1, `expected one refund, got ${t.refunds().length}`);
    assert(t.refunds()[0].args.p_request_id === 'request-refund', 'the refund must name the begun request');
  });
}

Deno.test('a successful call is never refunded', async () => {
  const t = setup({ generate: async () => ({ suggestions: ['one'] }) });
  const response = await t.call();
  assert(response.status === 200, 'expected success');
  assert(t.refunds().length === 0, 'a delivered result must keep its charge');
});

Deno.test('a denied begin (429) is never refunded and never reaches the provider', async () => {
  let generated = 0;
  const t = setup({
    begin: { data: { allowed: false, reason: 'user_limit' }, error: null },
    generate: async () => { generated++; return {}; },
  });
  const response = await t.call();
  assert(response.status === 429 && generated === 0, 'expected a plain 429');
  assert(t.refunds().length === 0, 'nothing was charged, so nothing is refunded');
});

Deno.test('a begin that failed outright is never refunded', async () => {
  const t = setup({
    begin: { data: null, error: new Error('quota RPC unavailable') },
    generate: async () => ({}),
  });
  const response = await t.call();
  assert(response.status === 503, 'expected a safe 503');
  assert(t.refunds().length === 0, 'no request was begun, so there is nothing to refund');
});

Deno.test('a mid-generation daily-limit 429 is not refunded', async () => {
  const t = setup({
    nextAttempt: { data: false, error: null },
    generate: async (_action, _payload, reserve) => {
      if (!await reserve(2)) throw failure('other');
      return {};
    },
  });
  const response = await t.call();
  assert(response.status === 429, `expected 429, got ${response.status}`);
  assert(t.refunds().length === 0, 'a 429 is not refunded');
});

Deno.test('a failed attempt reservation (unavailable) is refunded', async () => {
  const t = setup({
    nextAttempt: { data: null, error: new Error('reserve RPC down') },
    generate: async (_action, _payload, reserve) => {
      if (!await reserve(2)) throw failure('other');
      return {};
    },
  });
  const response = await t.call();
  assert(response.status === 503, `expected 503, got ${response.status}`);
  assert(t.refunds().length === 1, 'the user got nothing, so the attempt is refunded');
});

Deno.test('a request that outlives its deadline is refunded and still answers busy', async () => {
  const t = setup({
    totalRequestTimeoutMs: 20,
    generate: () => new Promise(() => { /* never settles */ }),
  });
  const response = await t.call();
  assert(response.status === 503, `expected the busy 503, got ${response.status}`);
  assert(t.refunds().length === 1, 'a timeout must be refunded even though the budget signal is already aborted');
});

Deno.test('a refund RPC error never changes the response', async () => {
  const t = setup({
    release: async () => ({ data: null, error: new Error('release RPC missing') }),
    generate: async () => { throw failure('busy'); },
  });
  const response = await withCapturedWarnings(t.logs, () => t.call());
  const body = await response.json();
  assert(response.status === 503 && /busy/i.test(body.error), `expected the unchanged busy 503, got ${response.status} ${JSON.stringify(body)}`);
  assert(response.headers.get('Retry-After') === '1', 'the busy response keeps its Retry-After');
  assert(t.logs.some(line => line.includes('ai-proxy') && line.includes('refund')), 'the failed refund is logged');
});

Deno.test('a refund RPC that throws never changes the response', async () => {
  const t = setup({
    release: async () => { throw new Error('network down'); },
    generate: async () => { throw failure('exhausted'); },
  });
  const response = await withCapturedWarnings(t.logs, () => t.call());
  const body = await response.json();
  assert(response.status === 503 && /free AI capacity/i.test(body.error), 'expected the unchanged capacity 503');
});

Deno.test('a refund that hangs cannot hold the response forever', async () => {
  const t = setup({
    release: () => new Promise(() => { /* never settles */ }),
    generate: async () => { throw failure('busy'); },
  });
  const started = Date.now();
  const response = await withCapturedWarnings(t.logs, () => t.call());
  assert(response.status === 503, 'expected the busy 503');
  assert(Date.now() - started < 8_000, 'the refund must be time-boxed');
});
