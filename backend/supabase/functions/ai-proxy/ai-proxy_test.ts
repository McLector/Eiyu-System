import { createAiProxyHandler } from './ai-proxy-core.ts';
import './ai-proxy-generator_test.ts';

type RpcResponse = { data: unknown; error: unknown };
type FakeClient = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc: (name: string, args: Record<string, unknown>) => Promise<RpcResponse>;
};

function fakeClient(options: {
  userId?: string | null;
  begin?: RpcResponse;
  nextAttempt?: RpcResponse;
  onRpc?: (name: string, args: Record<string, unknown>) => void;
} = {}): FakeClient {
  return {
    auth: {
      getUser: async () => ({ data: { user: options.userId === null ? null : { id: options.userId ?? 'verified-user' } }, error: null }),
    },
    rpc: async (name, args) => {
      options.onRpc?.(name, args);
      if (name === 'ai_begin_request') return options.begin ?? { data: { allowed: true, requestClass: 'suggestion', attemptNumber: 1 }, error: null };
      if (name === 'ai_reserve_next_attempt') return options.nextAttempt ?? { data: true, error: null };
      return { data: null, error: new Error(`unexpected RPC ${name}`) };
    },
  };
}

const authHeaders = { Authorization: 'Bearer disposable-test-token' };

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
  const begin = observed.find(call => call.name === 'ai_begin_request');
  if (response.status !== 200 || body.suggestions?.length !== 3 || !begin || begin.args.p_user_id !== 'verified-user') {
    throw new Error('expected successful output and the authenticated user id in the quota RPC');
  }
  if (observed.some(call => call.name !== 'ai_begin_request')) {
    throw new Error('the first provider slot must not be charged a second time');
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
  if (providerCalls !== 2 || observed.join(',') !== 'ai_begin_request,ai_reserve_next_attempt') {
    throw new Error(`expected one begin plus one retry reservation before two provider calls; got ${observed.join(',')}`);
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
