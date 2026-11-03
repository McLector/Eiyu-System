import {executionDenial, parseExecutionTicket} from './ai-proxy-admission.ts';
import type {ExecutionTicket} from './ai-proxy-admission.ts';

export type AiAction = 'easy-versions' | 'stage-breakdown' | 'weekly-summary';
export type AiPayload = Record<string, unknown> & { action: AiAction };
export type ProviderAttemptReservation = (attemptNumber: number) => Promise<boolean>;

export const DEFAULT_AI_REQUEST_TIMEOUT_MS = 16_000;
const PROCESSING_ACCESS_CHANGED = 'Weekly debrief access changed. Review your permissions, email verification and birthday in Profile.';
const processingRevisionKeys = ['ageVersion', 'mailboxVersion', 'consentVersion', 'authorityVersion'] as const;

function capturedProcessingAccess(body: unknown): Record<typeof processingRevisionKeys[number], number> | null {
  if (!isPlainObject(body) || !isPlainObject(body.processingAccess) || body.processingAccess.contractVersion !== 1) return null;
  const value = body.processingAccess;
  if (processingRevisionKeys.some(key => !Number.isSafeInteger(value[key])
    || (value[key] as number) < (key === 'authorityVersion' ? 0 : 1))) return null;
  return {ageVersion: value.ageVersion as number, mailboxVersion: value.mailboxVersion as number,
    consentVersion: value.consentVersion as number, authorityVersion: value.authorityVersion as number};
}

export type AiRequestContext = {
  signal: AbortSignal;
  deadlineAt: number;
  now: () => number;
  /** Providers the database says hit a daily quota; absent on a database from before migration 045. */
  exhaustedProviders?: string[];
  /** Records a daily-quota failure. Best effort: resolves even if the RPC is missing or fails. */
  markProviderExhausted?: (provider: string, resetTimeZone: string) => Promise<void>;
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
  allowedActions?: readonly AiAction[];
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
const REFUND_TIMEOUT_MS = 3_000;

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

function capacityResponse(cors: Record<string, string>): Response {
  return json({ error: 'The free AI capacity is used up for today. Please try again tomorrow.' }, 503, cors);
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
      // A metadata-only command: tracker text and totals come from the server, never the body.
      if (!isIsoDate(body.weekStart) || Object.keys(body).some(key => !['action', 'weekStart', 'processingAccess'].includes(key))) return null;
      return { action: 'weekly-summary' as const, weekStart: body.weekStart };
    }
    default:
      return null;
  }
}

const TRACKER_PERMISSION_REQUIRED = 'Your custom quests need permission before they can be used in a weekly debrief. Review it in Profile.';
const STATS_KEYS = ['STR', 'INT', 'DEX', 'WIS', 'CHA'];

// Server-built weekly evidence. Anything unexpected is unavailable, never repaired or truncated.
function canonicalWeekInput(value: unknown): { habits: Record<string, unknown>[]; statTotals: Record<string, number> } | 'invalid' | null {
  if (!isPlainObject(value) || Object.keys(value).length !== 2 || !Array.isArray(value.habits) || !isPlainObject(value.statTotals)) return null;
  const totals = value.statTotals;
  if (Object.keys(totals).length !== STATS_KEYS.length || STATS_KEYS.some(key => !Number.isSafeInteger(totals[key]) || (totals[key] as number) < 0)) return null;
  if (!value.habits.every(item => isPlainObject(item) && Object.keys(item).length === 4
    && typeof item.name === 'string' && typeof item.stat === 'string' && STATS_KEYS.includes(item.stat)
    && Number.isSafeInteger(item.fullCount) && Number(item.fullCount) >= 0
    && Number.isSafeInteger(item.easyCount) && Number(item.easyCount) >= 0)) return null;
  const input = { habits: value.habits as Record<string, unknown>[], statTotals: totals as Record<string, number> };
  if (input.habits.length > 100 || new TextEncoder().encode(JSON.stringify({ action: 'weekly-summary', weekStart: '0000-00-00', ...input })).byteLength > MAX_WEEKLY_INPUT_BYTES) return 'invalid';
  return input;
}

function quotaDeniedReason(value: unknown): string | null {
  return isPlainObject(value) && value.allowed === false && typeof value.reason === 'string'
    && ['user_limit', 'project_limit', 'reservation_required'].includes(value.reason)
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

function isExhaustedGenerationError(error: unknown): boolean {
  return error instanceof Error && (error as Error & { kind?: string }).kind === 'exhausted';
}

/** The gate is injectable so quota and provider behavior can be tested without a Supabase or Gemini project. */
export function createAiProxyHandler(dependencies: AiProxyDependencies): (request: Request) => Promise<Response> {
  const makeCorsHeaders = dependencies.corsHeaders ?? defaultCorsHeaders;
  // Arrow wrappers, not the bare globals: the clock calls these as `clock.setTimeout(...)`, and the Edge runtime's
  // timers throw "Illegal invocation" when `this` is anything but the global object.
  const clock = dependencies.clock ?? {
    now: () => Date.now(),
    setTimeout: ((...args: Parameters<typeof globalThis.setTimeout>) => globalThis.setTimeout(...args)) as typeof globalThis.setTimeout,
    clearTimeout: ((...args: Parameters<typeof globalThis.clearTimeout>) => globalThis.clearTimeout(...args)) as typeof globalThis.clearTimeout,
  };
  const totalRequestTimeoutMs = dependencies.totalRequestTimeoutMs ?? DEFAULT_AI_REQUEST_TIMEOUT_MS;

  // Best effort, on its own short deadline: by the time a timed-out or cancelled request refunds, the request budget's
  // signal has already fired. A failure here is logged and never changes the answer the user gets.
  const releaseRequest = async (requestId: string, cleanupStopAt = Infinity): Promise<void> => {
    const remaining = Math.min(REFUND_TIMEOUT_MS, cleanupStopAt - clock.now());
    if (remaining <= 0) return;
    const controller = new AbortController();
    const timer = clock.setTimeout(() => controller.abort(new Error('refund deadline exceeded')), remaining);
    try {
      const client = dependencies.createServiceClient(controller.signal);
      const { error } = await awaitAbortable(client.rpc('ai_release_request', { p_request_id: requestId }), controller.signal);
      if (error) console.warn('ai-proxy: could not refund a failed request');
    } catch {
      console.warn('ai-proxy: could not refund a failed request');
    } finally {
      clock.clearTimeout(timer);
    }
  };

  const settleExecution = async (ticket: ExecutionTicket, outcome: 'completed' | 'stopped-before-dispatch' | 'unresolved', cleanupStopAt: number): Promise<boolean> => {
    const remaining = Math.min(REFUND_TIMEOUT_MS, cleanupStopAt - clock.now());
    if (remaining <= 0) return false;
    const controller = new AbortController();
    const timer = clock.setTimeout(() => controller.abort(new Error('settlement deadline exceeded')), remaining);
    try {
      const client = dependencies.createServiceClient(controller.signal);
      const {data,error} = await awaitAbortable(client.rpc('ai_settle_execution', {
        p_execution_id: ticket.executionId, p_epoch: ticket.epoch, p_outcome: outcome,
      }), controller.signal);
      return !error && data === true;
    } catch {
      return false;
    } finally {
      clock.clearTimeout(timer);
    }
  };

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
      if (!payload || (dependencies.allowedActions && !dependencies.allowedActions.includes(payload.action))) {
        return json({ error: 'Request payload is invalid.' }, 400, cors);
      }
      // Authorization metadata is parsed separately; normalized prompt input
      // contains only the existing weekly evidence fields.
      const capturedProcessing = payload.action === 'weekly-summary' ? capturedProcessingAccess(body) : null;
      if (payload.action === 'weekly-summary' && !capturedProcessing) {
        return json({error: 'Refresh your debrief permissions before trying again.'}, 400, cors);
      }

      const stoppedBeforeQuota = abortedResponse(budget, cors);
      if (stoppedBeforeQuota) return stoppedBeforeQuota;
      try {
        dependencies.preflight?.();
      } catch {
        return unavailableResponse(cors);
      }

      const requestId = (dependencies.requestId ?? (() => crypto.randomUUID()))();
      const executionId = crypto.randomUUID();
      // Independent cleanup remains at most3s per operation, bounded overall by main deadline+3s.
      const cleanupStopAt = budget.context.deadlineAt + REFUND_TIMEOUT_MS;
      let quotaClient: RpcClient;
      try {
        quotaClient = dependencies.createServiceClient(budget.signal);
      } catch {
        return unavailableResponse(cors);
      }

      let generationPayload: AiPayload = payload;
      if (payload.action === 'weekly-summary' && capturedProcessing) {
        let inputData: unknown, inputError: unknown;
        try {
          ({ data: inputData, error: inputError } = await awaitAbortable(quotaClient.rpc('ai_tracker_week_input', {
            p_user_id: user.id,
            p_week_start: payload.weekStart,
            p_expected: { userId: user.id, ...capturedProcessing },
          }), budget.signal));
        } catch {
          const stopped = abortedResponse(budget, cors);
          if (stopped) return stopped;
          return unavailableResponse(cors);
        }
        if (inputError) {
          const code = isPlainObject(inputError) ? inputError.code : null;
          if (code === 'ET002') return json({ error: TRACKER_PERMISSION_REQUIRED }, 403, cors);
          if (code === 'EP001' || code === 'EP002') return json({ error: PROCESSING_ACCESS_CHANGED }, 403, cors);
          if (code === 'EM001') return json({ error: 'Verify your email to access your weekly debrief.' }, 403, cors);
          if (code === 'EA001') return json({ error: 'Adult AI eligibility is required. Check your birthday in Profile.' }, 403, cors);
          if (code === '22023') return json({ error: 'Request payload is invalid.' }, 400, cors);
          return unavailableResponse(cors);
        }
        const input = canonicalWeekInput(inputData);
        if (input === 'invalid') return json({ error: 'Request payload is invalid.' }, 400, cors);
        if (!input) return unavailableResponse(cors);
        generationPayload = { action: 'weekly-summary', weekStart: payload.weekStart, habits: input.habits, statTotals: input.statTotals };
      }

      let begin: unknown;
      try {
        const { data, error } = await awaitAbortable(quotaClient.rpc('ai_admit_execution', {
          p_user_id: user.id,
          p_action: payload.action,
          p_request_id: requestId,
          p_week_start: payload.action === 'weekly-summary' ? payload.weekStart : null,
          p_execution_id: executionId,
          p_contract_version: 1,
        }), budget.signal);
        if (error) {
          if (isPlainObject(error) && (error.code === 'EP001' || error.code === 'EP002')) {
            return json({error: PROCESSING_ACCESS_CHANGED}, 403, cors);
          }
          if (isPlainObject(error) && error.code === 'EM001') {
            return json({ error: 'Verify your email to access your weekly debrief.' }, 403, cors);
          }
          if (isPlainObject(error) && error.code === 'EA001') {
            return json({ error: 'Adult AI eligibility is required. Check your birthday in Profile.' }, 403, cors);
          }
          return unavailableResponse(cors);
        }
        begin = data;
      } catch {
        const stopped = abortedResponse(budget, cors);
        if (stopped) return stopped;
        return unavailableResponse(cors);
      }

      const denial = quotaDeniedReason(begin);
      if (denial) return json({ error: 'Your daily AI limit has been reached. Please try again later.' }, 429, cors);
      if (!isPlainObject(begin) || begin.allowed !== true || begin.attemptNumber !== 1) return unavailableResponse(cors);
      const ticket = parseExecutionTicket(begin, {requestId, executionId});
      if (!ticket) {
        // A possibly committed but unacknowledged admission is not safe to dispatch or settle.
        await releaseRequest(requestId, cleanupStopAt);
        return unavailableResponse(cors);
      }
      const stopBeforeDispatch = async (response: Response): Promise<Response> => {
        const [settled] = await Promise.all([
          settleExecution(ticket, 'stopped-before-dispatch', cleanupStopAt), releaseRequest(requestId, cleanupStopAt),
        ]);
        return settled ? response : unavailableResponse(cors);
      };
      if (!Number.isSafeInteger(begin.ageVersion) || (begin.ageVersion as number) < 1 ||
        (payload.action === 'weekly-summary' && (!Number.isSafeInteger(begin.mailboxVersion) || (begin.mailboxVersion as number) < 1
          || !Number.isSafeInteger(begin.consentVersion) || (begin.consentVersion as number) < 1
          || !Number.isSafeInteger(begin.authorityVersion) || (begin.authorityVersion as number) < 0))) {
        // The older backend already accepted and charged this request; no output can be released safely.
        return await stopBeforeDispatch(unavailableResponse(cors));
      }
      if (capturedProcessing && processingRevisionKeys.some(key => begin[key] !== capturedProcessing[key])) {
        return await stopBeforeDispatch(json({error: PROCESSING_ACCESS_CHANGED}, 403, cors));
      }

      let reservationFailure: 'quota' | 'unavailable' | 'age' | 'mailbox' | 'processing' | null = null;
      const reservedAttempts = new Set<number>();
      let authorizationUncertain = false;
      const reserveProviderAttempt: ProviderAttemptReservation = async attemptNumber => {
        if (budget.signal.aborted) return false;
        if (reservedAttempts.has(attemptNumber)) {
          reservationFailure = 'unavailable';
          return false;
        }
        if (attemptNumber !== reservedAttempts.size + 1 || attemptNumber > 4) return false;
        try {
          authorizationUncertain = true;
          const { data, error } = await awaitAbortable(quotaClient.rpc('ai_authorize_execution_attempt', {
            p_execution_id: ticket.executionId, p_epoch: ticket.epoch,
            p_attempt_number: attemptNumber,
          }), budget.signal);
          if (error) {
            reservationFailure = executionDenial(error);
            if (reservationFailure !== 'unavailable' || (isPlainObject(error) && error.code === 'ED001')) authorizationUncertain = false;
            return false;
          }
          if (data !== true) {
            if (data === false) authorizationUncertain = false;
            reservationFailure = 'unavailable';
            return false;
          }
          authorizationUncertain = false;
          reservedAttempts.add(attemptNumber);
          return true;
        } catch {
          if (!budget.cancelled() && !budget.timedOut()) reservationFailure = 'unavailable';
          return false;
        }
      };

      // Both are optional extras from migration 045: an older database simply omits the field and has no mark RPC.
      const exhaustedProviders = Array.isArray(begin.exhaustedProviders)
        ? begin.exhaustedProviders.filter((name): name is string => typeof name === 'string')
        : [];
      const markProviderExhausted = async (provider: string, resetTimeZone: string): Promise<void> => {
        if (budget.signal.aborted) return;
        try {
          const { error } = await awaitAbortable(quotaClient.rpc('ai_mark_provider_exhausted', {
            p_request_id: requestId,
            p_provider: provider,
            p_reset_time_zone: resetTimeZone,
          }), budget.signal);
          if (error) console.warn(`ai-proxy: could not record that provider ${provider} is exhausted`);
        } catch {
          if (!budget.cancelled() && !budget.timedOut()) {
            console.warn(`ai-proxy: could not record that provider ${provider} is exhausted`);
          }
        }
      };
      const generationContext: AiRequestContext = { ...budget.context, exhaustedProviders, markProviderExhausted };
      let generationResolved = false;

      // The user is charged when the request begins. A request that ends without a result or a 429 gives that attempt back.
      const outcome = async (): Promise<{ response: Response; refund: boolean }> => {
        try {
          const result = await awaitAbortable(
            dependencies.generate(generationPayload.action, generationPayload, reserveProviderAttempt, generationContext).then(value => {
              generationResolved = true;
              return value;
            }),
            budget.signal,
          );
          const stopped = abortedResponse(budget, cors);
          if (stopped) return { response: stopped, refund: true };
          if (reservationFailure === 'quota') {
            return { response: json({ error: 'Your daily AI limit has been reached. Please try again later.' }, 429, cors), refund: false };
          }
          if (reservationFailure === 'unavailable') return { response: unavailableResponse(cors), refund: true };
          if (reservationFailure === 'processing') return {response: json({error: PROCESSING_ACCESS_CHANGED}, 403, cors), refund: true};
          if (reservationFailure === 'mailbox') return { response: json({ error: 'Verify your email to access your weekly debrief.' }, 403, cors), refund: true };
          if (reservationFailure === 'age') return { response: json({ error: 'Adult AI eligibility is required. Check your birthday in Profile.' }, 403, cors), refund: true };
          return { response: json(result, 200, cors), refund: false };
        } catch (error) {
          const stopped = abortedResponse(budget, cors);
          if (stopped) return { response: stopped, refund: true };
          if (reservationFailure === 'mailbox') return { response: json({ error: 'Verify your email to access your weekly debrief.' }, 403, cors), refund: true };
          if (reservationFailure === 'processing') return {response: json({error: PROCESSING_ACCESS_CHANGED}, 403, cors), refund: true};
          if (reservationFailure === 'quota') {
            return { response: json({ error: 'Your daily AI limit has been reached. Please try again later.' }, 429, cors), refund: false };
          }
          if (reservationFailure === 'age') return { response: json({ error: 'Adult AI eligibility is required. Check your birthday in Profile.' }, 403, cors), refund: true };
          if (reservationFailure === 'unavailable') return { response: unavailableResponse(cors), refund: true };
          if (error instanceof Error && (error as Error & { kind?: string }).kind === 'limited') {
            const interval = (error as Error & { retryAfterSeconds?: number }).retryAfterSeconds;
            const retryAfter = typeof interval === 'number' && Number.isFinite(interval) && interval >= 1 && interval <= 86400
              ? Math.ceil(interval) : 60;
            return { response: json({ error: 'The free AI capacity is temporarily used up. Please try again later.' }, 503, cors, retryAfter), refund: true };
          }
          if (isExhaustedGenerationError(error)) return { response: capacityResponse(cors), refund: true };
          if (isBusyGenerationError(error)) return { response: busyResponse(cors), refund: true };
          return { response: json({ error: 'The AI request failed. Please try again.' }, 503, cors), refund: true };
        }
      };
      const { response, refund } = await outcome();
      const settlement = authorizationUncertain ? 'unresolved' : generationResolved ? 'completed' : reservedAttempts.size === 0 ? 'stopped-before-dispatch' : 'unresolved';
      const [settled] = await Promise.all([
        settleExecution(ticket, settlement, cleanupStopAt),
        refund ? releaseRequest(requestId, cleanupStopAt) : Promise.resolve(),
      ]);
      if (!settled) {
        if (!refund) await releaseRequest(requestId, cleanupStopAt);
        return unavailableResponse(cors);
      }
      if (response.status === 200) {
        let finalResponse: Response | null = abortedResponse(budget, cors);
        if (!finalResponse) {
          try {
            const {data,error} = await awaitAbortable(quotaClient.rpc('ai_prepare_execution_result', {
              p_execution_id: ticket.executionId, p_epoch: ticket.epoch, p_age_version: begin.ageVersion,
            }), budget.signal);
            if (error) {
              const reason = executionDenial(error);
              finalResponse = reason === 'processing' || reason === 'age'
                ? json({error: PROCESSING_ACCESS_CHANGED}, 403, cors)
                : reason === 'mailbox' ? json({error: 'Verify your email to access your weekly debrief.'}, 403, cors)
                : unavailableResponse(cors);
            } else if (data !== true) finalResponse = unavailableResponse(cors);
          } catch {
            finalResponse = abortedResponse(budget, cors) ?? unavailableResponse(cors);
          }
        }
        if (finalResponse) {
          await releaseRequest(requestId, cleanupStopAt);
          return finalResponse;
        }
      }
      return response;
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
