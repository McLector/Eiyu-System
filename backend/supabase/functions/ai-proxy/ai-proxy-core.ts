export type AiAction = 'easy-versions' | 'stage-breakdown' | 'weekly-summary';
export type AiPayload = Record<string, unknown> & { action: AiAction };
export type ProviderAttemptReservation = (attemptNumber: number) => Promise<boolean>;

export const DEFAULT_AI_REQUEST_TIMEOUT_MS = 16_000;

export type AiRequestContext = {
  signal: AbortSignal;
  deadlineAt: number;
  now: () => number;
};

type Clock = {
  now: () => number;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
};

type User = { id: string };
type UserClient = {
  auth: { getUser: () => Promise<{ data: { user: User | null }; error?: unknown }> };
};
type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export type AiProxyDependencies = {
  createUserClient: (authorization: string, signal: AbortSignal) => UserClient;
  createServiceClient: (signal: AbortSignal) => RpcClient;
  preflight?: () => void;
  generate: (
    action: AiAction,
    payload: AiPayload,
    reserveProviderAttempt: ProviderAttemptReservation,
    context: AiRequestContext,
  ) => Promise<Record<string, unknown>>;
  requestId?: () => string;
  corsHeaders?: (origin: string | null) => Record<string, string>;
  clock?: Clock;
  totalRequestTimeoutMs?: number;
};

const MAX_NAME_CODE_POINTS = 200;
const MAX_WEEKLY_INPUT_BYTES = 24_000;
const MAX_REQUEST_BODY_BYTES = 32_000;

function defaultCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(body: unknown, status: number, cors: Record<string, string>, retryAfter?: number): Response {
  const headers: Record<string, string> = { ...cors, 'Content-Type': 'application/json' };
  if (retryAfter !== undefined) headers['Retry-After'] = String(retryAfter);
  return new Response(JSON.stringify(body), { status, headers });
}

function busyResponse(cors: Record<string, string>): Response {
  return json({ error: 'The AI service is busy right now. Please try again shortly.' }, 503, cors, 1);
}

function unavailableResponse(cors: Record<string, string>): Response {
  return json({ error: 'AI service is temporarily unavailable.' }, 503, cors);
}

function cancelledResponse(cors: Record<string, string>): Response {
  return json({ error: 'The AI request was cancelled.' }, 499, cors);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new Error('The request was aborted.');
}

function awaitAbortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => {});
    return Promise.reject(abortError(signal));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      error => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

async function readLimitedJson(request: Request, signal: AbortSignal): Promise<unknown> {
  const declaredLength = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    throw new Error('request body too large');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error('request body missing');
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await awaitAbortable(reader.read(), signal);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) throw new Error('request body too large');
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    try { await reader.cancel(error); } catch { /* The body may already be closed. */ }
    throw error;
  }
}

function normalizedPayload(body: unknown): AiPayload | null {
  if (!isPlainObject(body)) return null;
  switch (body.action) {
    case 'easy-versions': {
      if (typeof body.habitName !== 'string') return null;
      const habitName = body.habitName.trim();
      if (!habitName || Array.from(habitName).length > MAX_NAME_CODE_POINTS) return null;
      return { action: 'easy-versions', habitName, stat: typeof body.stat === 'string' ? body.stat : '' };
    }
    case 'stage-breakdown': {
      if (typeof body.questName !== 'string') return null;
      const questName = body.questName.trim();
      if (!questName || Array.from(questName).length > MAX_NAME_CODE_POINTS) return null;
      return { action: 'stage-breakdown', questName, stat: typeof body.stat === 'string' ? body.stat : '' };
    }
    case 'weekly-summary': {
      if (!isIsoDate(body.weekStart) || !Array.isArray(body.habits) || body.habits.length > 100 || !isPlainObject(body.statTotals)) {
        return null;
      }
      const habits = body.habits;
      if (!habits.every(item => isPlainObject(item)
        && typeof item.name === 'string'
        && typeof item.stat === 'string'
        && Number.isInteger(item.fullCount) && Number(item.fullCount) >= 0
        && Number.isInteger(item.easyCount) && Number(item.easyCount) >= 0)) return null;
      if (Object.values(body.statTotals).some(value => !Number.isInteger(value) || Number(value) < 0)) return null;
      const payload = {
        action: 'weekly-summary' as const,
        weekStart: body.weekStart,
        habits,
        statTotals: body.statTotals,
      };
      if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > MAX_WEEKLY_INPUT_BYTES) return null;
      return payload;
    }
    default:
      return null;
  }
}

function quotaDeniedReason(value: unknown): string | null {
  return isPlainObject(value) && value.allowed === false && typeof value.reason === 'string'
    ? value.reason
    : null;
}

type RequestBudget = {
  context: AiRequestContext;
  signal: AbortSignal;
  timedOut: () => boolean;
  cancelled: () => boolean;
  dispose: () => void;
};

function makeRequestBudget(request: Request, clock: Clock, timeoutMs: number): RequestBudget {
  const controller = new AbortController();
  const startedAt = clock.now();
  const deadlineAt = startedAt + timeoutMs;
  let timedOut = false;
  let cancelled = false;
  const onRequestAbort = () => {
    cancelled = true;
    controller.abort(new Error('Request cancelled by caller.'));
  };
  if (request.signal.aborted) onRequestAbort();
  else request.signal.addEventListener('abort', onRequestAbort, { once: true });
  const timer = clock.setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('AI request deadline exceeded.'));
  }, Math.max(0, timeoutMs));
  return {
    context: { signal: controller.signal, deadlineAt, now: clock.now },
    signal: controller.signal,
    timedOut: () => timedOut || clock.now() >= deadlineAt,
    cancelled: () => cancelled,
    dispose: () => {
      clock.clearTimeout(timer);
      request.signal.removeEventListener('abort', onRequestAbort);
    },
  };
}

function abortedResponse(budget: RequestBudget, cors: Record<string, string>): Response | null {
  if (budget.timedOut()) return busyResponse(cors);
  if (budget.cancelled()) return cancelledResponse(cors);
  return null;
}

function isBusyGenerationError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'GeminiBusyError' || (error as Error & { kind?: string }).kind === 'busy');
}

/** The gate is injectable so quota and provider behavior can be tested without a Supabase or Gemini project. */
export function createAiProxyHandler(dependencies: AiProxyDependencies): (request: Request) => Promise<Response> {
  const makeCorsHeaders = dependencies.corsHeaders ?? defaultCorsHeaders;
  const clock = dependencies.clock ?? {
    now: Date.now,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  const totalRequestTimeoutMs = dependencies.totalRequestTimeoutMs ?? DEFAULT_AI_REQUEST_TIMEOUT_MS;

  const handle = async (request: Request): Promise<Response> => {
    const cors = makeCorsHeaders(request.headers.get('Origin'));
    if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, cors);

    const budget = makeRequestBudget(request, clock, totalRequestTimeoutMs);
    try {
      const authorization = request.headers.get('Authorization');
      if (!authorization) return json({ error: 'Missing Authorization header.' }, 401, cors);

      let user: User | null = null;
      try {
        const userClient = dependencies.createUserClient(authorization, budget.signal);
        const result = await awaitAbortable(userClient.auth.getUser(), budget.signal);
        if (result.error || !result.data.user) return json({ error: 'Unauthorized.' }, 401, cors);
        user = result.data.user;
      } catch (error) {
        const stopped = abortedResponse(budget, cors);
        if (stopped) return stopped;
        return unavailableResponse(cors);
      }

      let body: unknown;
      try {
        body = await awaitAbortable(readLimitedJson(request, budget.signal), budget.signal);
      } catch (error) {
        const stopped = abortedResponse(budget, cors);
        if (stopped) return stopped;
        return json({ error: 'Request body must be valid JSON.' }, 400, cors);
      }
      const payload = normalizedPayload(body);
      if (!payload) return json({ error: 'Request payload is invalid.' }, 400, cors);

      const stoppedBeforeQuota = abortedResponse(budget, cors);
      if (stoppedBeforeQuota) return stoppedBeforeQuota;
      try {
        dependencies.preflight?.();
      } catch {
        return unavailableResponse(cors);
      }

      const requestId = (dependencies.requestId ?? (() => crypto.randomUUID()))();
      let quotaClient: RpcClient;
      try {
        quotaClient = dependencies.createServiceClient(budget.signal);
      } catch {
        return unavailableResponse(cors);
      }

      let begin: unknown;
      try {
        const { data, error } = await awaitAbortable(quotaClient.rpc('ai_begin_request', {
          p_user_id: user.id,
          p_action: payload.action,
          p_request_id: requestId,
          p_week_start: payload.action === 'weekly-summary' ? payload.weekStart : null,
        }), budget.signal);
        if (error) return unavailableResponse(cors);
        begin = data;
      } catch {
        const stopped = abortedResponse(budget, cors);
        if (stopped) return stopped;
        return unavailableResponse(cors);
      }

      const denial = quotaDeniedReason(begin);
      if (denial) return json({ error: 'Your daily AI limit has been reached. Please try again later.' }, 429, cors);
      if (!isPlainObject(begin) || begin.allowed !== true || begin.attemptNumber !== 1) {
        return unavailableResponse(cors);
      }

      let reservationFailure: 'quota' | 'unavailable' | null = null;
      const reservedAttempts = new Set<number>([1]);
      const reserveProviderAttempt: ProviderAttemptReservation = async attemptNumber => {
        if (budget.signal.aborted) return false;
        if (reservedAttempts.has(attemptNumber)) return true;
        if (attemptNumber !== reservedAttempts.size + 1 || attemptNumber > 4) return false;
        try {
          const { data, error } = await awaitAbortable(quotaClient.rpc('ai_reserve_next_attempt', {
            p_request_id: requestId,
            p_attempt_number: attemptNumber,
          }), budget.signal);
          if (error) {
            reservationFailure = 'unavailable';
            return false;
          }
          if (data !== true) {
            reservationFailure = 'quota';
            return false;
          }
          reservedAttempts.add(attemptNumber);
          return true;
        } catch {
          if (!budget.cancelled() && !budget.timedOut()) reservationFailure = 'unavailable';
          return false;
        }
      };

      try {
        const result = await awaitAbortable(
          dependencies.generate(payload.action, payload, reserveProviderAttempt, budget.context),
          budget.signal,
        );
        const stopped = abortedResponse(budget, cors);
        if (stopped) return stopped;
        if (reservationFailure === 'quota') {
          return json({ error: 'Your daily AI limit has been reached. Please try again later.' }, 429, cors);
        }
        if (reservationFailure === 'unavailable') return unavailableResponse(cors);
        return json(result, 200, cors);
      } catch (error) {
        const stopped = abortedResponse(budget, cors);
        if (stopped) return stopped;
        if (reservationFailure === 'quota') {
          return json({ error: 'Your daily AI limit has been reached. Please try again later.' }, 429, cors);
        }
        if (reservationFailure === 'unavailable') return unavailableResponse(cors);
        if (isBusyGenerationError(error)) return busyResponse(cors);
        return json({ error: 'The AI request failed. Please try again.' }, 503, cors);
      }
    } finally {
      budget.dispose();
    }
  };

  // Last resort. Anything thrown outside the guarded steps above would otherwise escape as a bare text/plain 500 with
  // no CORS headers, which a browser can only report as "Failed to send a request to the Edge Function".
  return async request => {
    try {
      return await handle(request);
    } catch (error) {
      console.error('ai-proxy: unhandled error', error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      let cors: Record<string, string> = {};
      try { cors = makeCorsHeaders(request.headers.get('Origin')); } catch { /* answer without CORS rather than throw again */ }
      return unavailableResponse(cors);
    }
  };
}
