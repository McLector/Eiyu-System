import { createGeminiGenerator } from './ai-proxy-generator.ts';
import { createAiProxyHandler } from './ai-proxy-core.ts';
import type { AiAction, AiPayload, AiRequestContext, ProviderAttemptReservation } from './ai-proxy-core.ts';
import { DEFAULT_AI_REQUEST_TIMEOUT_MS } from './ai-proxy-core.ts';
import { DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS, MAX_ATTEMPTS_PER_MODEL, MAX_PROVIDER_ATTEMPTS } from './ai-proxy-generator.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function assertRejects(action: () => Promise<unknown>, predicate: (error: unknown) => boolean, message: string) {
  try {
    await action();
  } catch (error) {
    assert(predicate(error), `${message}: unexpected rejection ${String(error)}`);
    return;
  }
  throw new Error(`${message}: expected rejection`);
}

function providerResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function geminiArray(values: unknown[]): Response {
  return providerResponse(200, {
    candidates: [{ content: { parts: [{ text: JSON.stringify(values) }] }, finishReason: 'STOP' }],
  });
}

function geminiText(value: string, finishReason = 'STOP'): Response {
  return providerResponse(200, {
    candidates: [{ content: { parts: [{ text: value }] }, finishReason }],
  });
}

function makeContext(options: { signal?: AbortSignal; now?: () => number; deadlineAt?: number } = {}): AiRequestContext {
  const now = options.now ?? (() => 1_000);
  return {
    signal: options.signal ?? new AbortController().signal,
    deadlineAt: options.deadlineAt ?? now() + 16_000,
    now,
  };
}

function reservedAttempts(seen: number[] = []): { seen: number[]; reserve: ProviderAttemptReservation } {
  return {
    seen,
    reserve: async attempt => {
      seen.push(attempt);
      return true;
    },
  };
}

function easyPayload(): AiPayload {
  return { action: 'easy-versions', habitName: 'Run five kilometres', stat: 'STR' };
}

Deno.test('production request limits are 16 seconds total, 3 seconds per provider attempt, and four attempts max', () => {
  assert(DEFAULT_AI_REQUEST_TIMEOUT_MS === 16_000, 'the whole request deadline includes auth and quota work');
  assert(DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS === 3_000, 'each outbound provider attempt has a 3-second deadline');
  assert(MAX_PROVIDER_ATTEMPTS === 4 && MAX_ATTEMPTS_PER_MODEL === 2, 'retry bounds are four overall and two per model');
});

Deno.test('the production generator retries a transient primary 503 and preserves the suggestions contract', async () => {
  const urls: string[] = [];
  const delays: number[] = [];
  const reservations = reservedAttempts();
  let call = 0;
  const generate = createGeminiGenerator({
    apiKey: 'test-key',
    primaryModel: 'primary-model',
    fallbackModel: 'fallback-model',
    retryEnabled: true,
    random: () => 0,
    sleep: async ms => { delays.push(ms); },
    fetch: async input => {
      urls.push(String(input));
      call++;
      return call === 1
        ? providerResponse(503, { error: { status: 'UNAVAILABLE', message: 'temporary outage' } })
        : geminiArray(['walk for two minutes', 'read one page', 'stretch briefly']);
    },
  });

  const result = await generate('easy-versions', easyPayload(), reservations.reserve, makeContext());
  assert(JSON.stringify(result) === JSON.stringify({ suggestions: ['walk for two minutes', 'read one page', 'stretch briefly'] }), 'successful retry must preserve { suggestions }');
  assert(urls.length === 2 && urls[0].includes('/models/primary-model:') && urls[1].includes('/models/primary-model:'), 'the first retry should remain on the primary model');
  assert(JSON.stringify(reservations.seen) === JSON.stringify([1, 2]), 'each fetch must use its reserved attempt number');
  assert(JSON.stringify(delays) === JSON.stringify([250]), 'the first transient retry uses the bounded 250 ms delay before jitter');
});

Deno.test('the production generator falls back after two transient primary failures and preserves stages/summary shapes', async () => {
  for (const action of ['stage-breakdown', 'weekly-summary'] as const) {
    const models: string[] = [];
    const delays: number[] = [];
    const reservations = reservedAttempts();
    let primaryCalls = 0;
    const generate = createGeminiGenerator({
      apiKey: 'test-key',
      primaryModel: 'primary-model',
      fallbackModel: 'fallback-model',
      retryEnabled: true,
      random: () => 0,
      sleep: async ms => { delays.push(ms); },
      fetch: async input => {
        const url = String(input);
        const model = url.match(/\/models\/([^:/]+):/)?.[1] ?? 'missing';
        models.push(model);
        if (model === 'primary-model') {
          primaryCalls++;
          return providerResponse(503, { error: { status: 'UNAVAILABLE', message: 'temporary outage' } });
        }
        return action === 'stage-breakdown'
          ? geminiArray(['choose a trail', 'walk five kilometres', 'finish the route'])
          : geminiText('You kept a steady rhythm with your walks, and your strength work showed up consistently.');
      },
    });
    const payload: AiPayload = action === 'stage-breakdown'
      ? { action, questName: 'Finish a long hike', stat: 'STR' }
      : { action, weekStart: '2026-09-28', habits: [], statTotals: {} };
    const result = await generate(action, payload, reservations.reserve, makeContext());
    const expected = action === 'stage-breakdown'
      ? { stages: ['choose a trail', 'walk five kilometres', 'finish the route'] }
      : { summary: 'You kept a steady rhythm with your walks, and your strength work showed up consistently.' };
    assert(JSON.stringify(result) === JSON.stringify(expected), `${action} must preserve its existing response shape`);
    assert(primaryCalls === 2 && models.join(',') === 'primary-model,primary-model,fallback-model', `${action} must switch to fallback only after two primary attempts`);
    assert(JSON.stringify(reservations.seen) === JSON.stringify([1, 2, 3]), `${action} must reserve each provider attempt once`);
    assert(JSON.stringify(delays) === JSON.stringify([250, 500]), `${action} uses bounded 250/500 ms backoff before fallback`);
  }
});

Deno.test('the production generator retries only documented transient statuses and classified per-minute 429s', async () => {
  const retryableStatuses = [408, 500, 502, 503, 504];
  for (const status of retryableStatuses) {
    let calls = 0;
    const generate = createGeminiGenerator({
      apiKey: 'test-key', primaryModel: 'primary-model', retryEnabled: true,
      sleep: async () => {}, random: () => 0,
      fetch: async () => ++calls === 1
        ? providerResponse(status, { error: { message: 'temporary provider error' } })
        : geminiArray(['walk for two minutes', 'read one page', 'stretch briefly']),
    });
    await generate('easy-versions', easyPayload(), reservedAttempts().reserve, makeContext());
    assert(calls === 2, `HTTP ${status} should be retried once`);
  }

  for (const body of [
    { error: { message: 'quota exceeded' } },
    { error: { message: 'daily request limit reached' } },
  ]) {
    let calls = 0;
    const generate = createGeminiGenerator({
      apiKey: 'test-key', primaryModel: 'primary-model', fallbackModel: 'fallback-model', retryEnabled: true,
      fetch: async () => { calls++; return providerResponse(429, body); },
    });
    await assertRejects(
      () => generate('easy-versions', easyPayload(), reservedAttempts().reserve, makeContext()),
      error => error instanceof Error && error.name === 'GeminiProviderError',
      'unclassified or daily-quota 429 must fail without retry',
    );
    assert(calls === 1, 'an unclassified/daily 429 must not retry or fall back');
  }

  let rpmCalls = 0;
  const rpm = createGeminiGenerator({
    apiKey: 'test-key', primaryModel: 'primary-model', retryEnabled: true,
    sleep: async () => {}, random: () => 0,
    fetch: async () => ++rpmCalls === 1
      ? providerResponse(429, { error: { message: 'Requests per minute limit exceeded' } })
      : geminiArray(['walk for two minutes', 'read one page', 'stretch briefly']),
  });
  await rpm('easy-versions', easyPayload(), reservedAttempts().reserve, makeContext());
  assert(rpmCalls === 2, 'a clearly classified per-minute 429 should retry');
});

Deno.test('malformed provider output and non-retryable 4xx responses fail without a second model call', async () => {
  for (const response of [
    providerResponse(400, { error: { message: 'invalid request' } }),
    providerResponse(401, { error: { message: 'unauthorized' } }),
    providerResponse(402, { error: { message: 'billing disabled' } }),
    providerResponse(403, { error: { message: 'forbidden' } }),
    providerProviderMalformed(),
  ]) {
    let calls = 0;
    const generate = createGeminiGenerator({
      apiKey: 'test-key', primaryModel: 'primary-model', fallbackModel: 'fallback-model', retryEnabled: true,
      fetch: async () => { calls++; return response.clone(); },
    });
    await assertRejects(
      () => generate('easy-versions', easyPayload(), reservedAttempts().reserve, makeContext()),
      error => error instanceof Error,
      'non-retryable output should fail clearly',
    );
    assert(calls === 1, 'client errors and malformed success output must not retry');
  }
});

function providerProviderMalformed(): Response {
  return providerResponse(200, { candidates: [{ content: { parts: [{ text: '["only one"]' }] } }] });
}

Deno.test('the retry cap is four provider attempts with two per model and 250/500 ms bounded waits', async () => {
  const models: string[] = [];
  const delays: number[] = [];
  const reservations = reservedAttempts();
  const generate = createGeminiGenerator({
    apiKey: 'test-key', primaryModel: 'primary-model', fallbackModel: 'fallback-model', retryEnabled: true,
    random: () => 0.75,
    sleep: async ms => { delays.push(ms); },
    fetch: async input => {
      models.push(String(input).match(/\/models\/([^:/]+):/)?.[1] ?? 'missing');
      return providerResponse(503, { error: { message: 'busy' } });
    },
  });
  await assertRejects(
    () => generate('easy-versions', easyPayload(), reservations.reserve, makeContext()),
    error => error instanceof Error && error.name === 'GeminiProviderError',
    'transient outage should stop after bounded attempts',
  );
  assert(models.join(',') === 'primary-model,primary-model,fallback-model,fallback-model', 'each model is limited to two attempts');
  assert(reservations.seen.join(',') === '1,2,3,4', 'every actual provider attempt must reserve one numbered slot');
  assert(delays.join(',') === '325,575,575', 'jitter remains bounded over 250/500 ms base waits');
});

Deno.test('a provider attempt is aborted at its configured timeout and caller cancellation stops retries', async () => {
  let timedOut = false;
  const timeoutGenerator = createGeminiGenerator({
    apiKey: 'test-key', primaryModel: 'primary-model', retryEnabled: false, attemptTimeoutMs: 10,
    fetch: (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { timedOut = true; reject(new DOMException('aborted', 'AbortError')); }, { once: true });
    }),
  });
  await assertRejects(
    () => timeoutGenerator('easy-versions', easyPayload(), reservedAttempts().reserve, makeContext()),
    error => error instanceof Error && error.name === 'GeminiProviderError',
    'attempt timeout should become a safe provider error',
  );
  assert(timedOut, 'per-attempt timeout must abort the fetch signal');

  const caller = new AbortController();
  let calls = 0;
  const cancellationGenerator = createGeminiGenerator({
    apiKey: 'test-key', primaryModel: 'primary-model', fallbackModel: 'fallback-model', retryEnabled: true,
    fetch: async (_input, init) => {
      calls++;
      caller.abort('disconnected');
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
      return providerResponse(503, {});
    },
  });
  await assertRejects(
    () => cancellationGenerator('easy-versions', easyPayload(), reservedAttempts().reserve, makeContext({ signal: caller.signal })),
    error => error instanceof Error && error.name === 'GeminiRequestCancelledError',
    'caller cancellation should stop the generator',
  );
  assert(calls === 1, 'caller cancellation must not start a retry');
});

Deno.test('a timed-out provider attempt retries within the cap when the caller remains connected', async () => {
  let calls = 0;
  const reservations = reservedAttempts();
  const delays: number[] = [];
  const generate = createGeminiGenerator({
    apiKey: 'test-key', primaryModel: 'primary-model', retryEnabled: true,
    attemptTimeoutMs: 10, sleep: async ms => { delays.push(ms); }, random: () => 0,
    fetch: async (_input, init) => {
      calls++;
      if (calls === 1) {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
        });
      }
      return geminiArray(['walk briefly', 'read one page', 'stretch lightly']);
    },
  });
  const result = await generate('easy-versions', easyPayload(), reservations.reserve, makeContext());
  assert(JSON.stringify(result) === JSON.stringify({ suggestions: ['walk briefly', 'read one page', 'stretch lightly'] }), 'a timed-out attempt may recover on retry');
  assert(calls === 2 && reservations.seen.join(',') === '1,2' && delays.join(',') === '250', 'timeout recovery remains bounded and quota-counted');
});

Deno.test('missing provider configuration and cancellation during reservation cause no provider fetch', async () => {
  let reservationCalls = 0;
  let providerCalls = 0;
  const missingKey = createGeminiGenerator({
    apiKey: '', primaryModel: 'primary-model', retryEnabled: false,
    fetch: async () => { providerCalls++; return geminiArray(['walk briefly', 'read one page', 'stretch lightly']); },
  });
  await assertRejects(
    () => missingKey('easy-versions', easyPayload(), async () => { reservationCalls++; return true; }, makeContext()),
    error => error instanceof Error && error.name === 'GeminiProviderError',
    'missing API key must fail before reserving an outbound attempt',
  );
  assert(reservationCalls === 0 && providerCalls === 0, 'missing provider configuration must not reserve or fetch');

  const controller = new AbortController();
  let lateFetches = 0;
  const delayedReservation = createGeminiGenerator({
    apiKey: 'test-key', primaryModel: 'primary-model', retryEnabled: false,
    fetch: async () => { lateFetches++; return geminiArray(['walk briefly', 'read one page', 'stretch lightly']); },
  });
  const reservation = async () => {
    await new Promise(resolve => setTimeout(resolve, 15));
    return true;
  };
  setTimeout(() => controller.abort('caller left'), 1);
  await assertRejects(
    () => delayedReservation('easy-versions', easyPayload(), reservation, makeContext({ signal: controller.signal })),
    error => error instanceof Error && error.name === 'GeminiRequestCancelledError',
    'cancellation while reserving must stop before fetch',
  );
  assert(lateFetches === 0, 'a late reservation response must not start provider traffic after cancellation');
});

Deno.test('handler preflight configuration failure happens before quota reservation', async () => {
  let quotaCalls = 0;
  let providerCalls = 0;
  const handler = createAiProxyHandler({
    preflight: () => { throw new Error('missing provider key'); },
    createUserClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'verified-user' } }, error: null }) } }),
    createServiceClient: () => ({ rpc: async () => { quotaCalls++; return { data: { allowed: true, attemptNumber: 1 }, error: null }; } }),
    generate: async () => { providerCalls++; return { suggestions: ['one', 'two', 'three'] }; },
  });
  const response = await handler(new Request('https://local.test/ai', {
    method: 'POST', headers: { Authorization: 'Bearer disposable-test-token' },
    body: JSON.stringify({ action: 'easy-versions', habitName: 'Read' }),
  }));
  assert(response.status === 503 && quotaCalls === 0 && providerCalls === 0, 'preflight failure must preserve all quota and provider usage');
});

Deno.test('the real generator uses the handler reservation gate and a denied retry never fetches', async () => {
  for (const denyRetry of [false, true]) {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let providerCalls = 0;
    const generator = createGeminiGenerator({
      apiKey: 'test-key', primaryModel: 'primary-model', fallbackModel: 'fallback-model', retryEnabled: true,
      random: () => 0, sleep: async () => {},
      fetch: async () => {
        providerCalls++;
        return providerCalls === 1
          ? providerResponse(503, { error: { message: 'UNAVAILABLE' } })
          : geminiArray(['walk briefly', 'read one page', 'stretch lightly']);
      },
    });
    const handler = createAiProxyHandler({
      requestId: () => 'one-logical-request',
      createUserClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'verified-user' } }, error: null }) } }),
      createServiceClient: () => ({
        rpc: async (name, args) => {
          rpcCalls.push({ name, args });
          if (name === 'ai_begin_request') return { data: { allowed: true, attemptNumber: 1 }, error: null };
          return denyRetry ? { data: false, error: null } : { data: true, error: null };
        },
      }),
      generate: generator,
    });
    const response = await handler(new Request('https://local.test/ai', {
      method: 'POST', headers: { Authorization: 'Bearer disposable-test-token' },
      body: JSON.stringify({ ...easyPayload(), userId: 'forged-user', requestClass: 'regen' }),
    }));
    const expectedProviderCalls = denyRetry ? 1 : 2;
    assert(response.status === (denyRetry ? 429 : 200), 'reservation denial is distinct from successful generation');
    assert(providerCalls === expectedProviderCalls, 'provider fetches must stop before a denied retry');
    assert(rpcCalls[0]?.name === 'ai_begin_request' && rpcCalls[0]?.args.p_user_id === 'verified-user', 'the logical reservation uses only the verified identity');
    assert(rpcCalls.filter(call => call.name === 'ai_begin_request').length === 1, 'all retries share one logical request reservation');
    assert(rpcCalls.filter(call => call.name === 'ai_reserve_next_attempt').length === (denyRetry ? 1 : 1), 'the retry slot is requested exactly once');
    if (!denyRetry) {
      const body = await response.json();
      assert(JSON.stringify(body) === JSON.stringify({ suggestions: ['walk briefly', 'read one page', 'stretch lightly'] }), 'integrated output keeps the existing success body');
    }
  }
});

Deno.test('the handler deadline includes slow authentication and quota calls', async () => {
  const never = () => new Promise<never>(() => {});
  let quotaCalls = 0;
  let generationCalls = 0;
  const handler = createAiProxyHandler({
    totalRequestTimeoutMs: 15,
    createUserClient: () => ({ auth: { getUser: never } }),
    createServiceClient: () => ({ rpc: async () => { quotaCalls++; return { data: { allowed: true, attemptNumber: 1 }, error: null }; } }),
    generate: async () => { generationCalls++; return { suggestions: [] }; },
  });
  const started = Date.now();
  const response = await handler(new Request('https://local.test/ai', {
    method: 'POST', headers: { Authorization: 'Bearer disposable-test-token' },
    body: JSON.stringify({ action: 'easy-versions', habitName: 'Read' }),
  }));
  const elapsed = Date.now() - started;
  assert(response.status === 503 && elapsed < 500, `slow auth must return a bounded 503 (elapsed=${elapsed}ms)`);
  assert(quotaCalls === 0 && generationCalls === 0, 'timeout before auth must prevent quota and provider work');

  let slowQuotaCalls = 0;
  let slowQuotaGeneration = 0;
  const quotaHandler = createAiProxyHandler({
    totalRequestTimeoutMs: 15,
    createUserClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'verified-user' } }, error: null }) } }),
    createServiceClient: () => ({ rpc: async () => { slowQuotaCalls++; return never(); } }),
    generate: async () => { slowQuotaGeneration++; return { suggestions: ['one', 'two', 'three'] }; },
  });
  const quotaStarted = Date.now();
  const quotaResponse = await quotaHandler(new Request('https://local.test/ai', {
    method: 'POST', headers: { Authorization: 'Bearer disposable-test-token' },
    body: JSON.stringify({ action: 'easy-versions', habitName: 'Read' }),
  }));
  const quotaElapsed = Date.now() - quotaStarted;
  assert(quotaResponse.status === 503 && quotaElapsed < 500, `slow quota work must return a bounded 503 (elapsed=${quotaElapsed}ms)`);
  assert(slowQuotaCalls === 1 && slowQuotaGeneration === 0, 'timeout during quota must prevent provider work');
});

Deno.test('guard-only rollout uses one attempt while bounded rollout can use four through the same generator', async () => {
  const observed: Record<string, number> = {};
  for (const enabled of [false, true]) {
    let calls = 0;
    const generate = createGeminiGenerator({
      apiKey: 'test-key', primaryModel: 'primary-model', fallbackModel: 'fallback-model', retryEnabled: enabled,
      sleep: async () => {}, random: () => 0,
      fetch: async () => { calls++; return providerResponse(503, {}); },
    });
    await assertRejects(
      () => generate('easy-versions', easyPayload(), reservedAttempts().reserve, makeContext()),
      error => error instanceof Error,
      'test outage should fail',
    );
    observed[String(enabled)] = calls;
  }
  assert(observed.false === 1 && observed.true === 4, 'both deployment modes share quota behavior but enforce their intended call count');
});
