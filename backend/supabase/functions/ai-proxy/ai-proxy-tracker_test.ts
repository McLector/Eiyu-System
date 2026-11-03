import {admittedFixtureData, createInstrumentedTestHandler as createAiProxyHandler} from './test-helpers/admission.ts';

function assert(value: unknown, message: string): asserts value {if (!value) throw new Error(message);}
const OWNER = 'synthetic-tracker-owner';
const allowed = {allowed: true, attemptNumber: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0};
const access = {contractVersion: 1, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0};
const canonical = {habits: [{name: 'Quest 1', stat: 'STR', fullCount: 2, easyCount: 1}],
  statTotals: {STR: 3, INT: 0, DEX: 0, WIS: 0, CHA: 0}};

type Options = {body?: Record<string, unknown>; input?: unknown; inputError?: {code: string}; begin?: unknown};
function fixture(options: Options = {}) {
  const calls: string[] = []; const inputArgs: Record<string, unknown>[] = [];
  let generated = 0, refunds = 0; let forwarded: Record<string, unknown> | undefined;
  const client = {auth: {getUser: async () => ({data: {user: {id: OWNER}}, error: null})},
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(name);
      if (name === 'ai_tracker_week_input') {
        inputArgs.push(args);
        return options.inputError ? {data: null, error: options.inputError}
          : {data: 'input' in options ? options.input : canonical, error: null};
      }
      if (name === 'ai_admit_execution') return {data: admittedFixtureData(options.begin ?? allowed, args), error: null};
      if (name === 'ai_release_request') {refunds++; return {data: true, error: null};}
      if (name === 'ai_settle_execution' || name === 'ai_prepare_execution_result' || name === 'ai_authorize_execution_attempt') return {data: true, error: null};
      return {data: null, error: new Error('Unexpected fake RPC')};
    }};
  const handler = createAiProxyHandler({createUserClient: () => client, createServiceClient: () => client,
    generate: async (_action, payload) => {generated++; forwarded = payload; return {summary: 'Synthetic reviewed debrief'};}}, {canonicalInput: 'client'});
  const body = options.body ?? {action: 'weekly-summary', weekStart: '2026-10-19', processingAccess: access};
  return {call: () => handler(new Request('https://local.test/ai', {method: 'POST',
    headers: {Authorization: 'Bearer synthetic-tracker-token'}, body: JSON.stringify(body)})),
  calls: () => calls, inputArgs: () => inputArgs, counts: () => ({generated, refunds}), forwarded: () => forwarded};
}

Deno.test('metadata-only weekly command reads canonical input before admission and forwards it only to the generator', async () => {
  const f = fixture(); const response = await f.call();
  assert(response.status === 200, 'eligible canonical input produces a debrief');
  assert(f.calls().indexOf('ai_tracker_week_input') === 0 && f.calls().indexOf('ai_tracker_week_input') < f.calls().indexOf('ai_admit_execution'), 'canonical read precedes admission');
  assert(JSON.stringify(f.inputArgs()[0]) === JSON.stringify({p_user_id: OWNER, p_week_start: '2026-10-19',
    p_expected: {userId: OWNER, ageVersion: 1, mailboxVersion: 1, consentVersion: 2, authorityVersion: 0}}), 'subject and five-field tuple come from the verified session and captured tuple');
  assert(JSON.stringify(f.forwarded()) === JSON.stringify({action: 'weekly-summary', weekStart: '2026-10-19', ...canonical}), 'generator receives only the enriched canonical payload');
});

for (const extra of [{habits: []}, {statTotals: {}}, {habits: [{name: 'Arbitrary text', stat: 'STR', fullCount: 1, easyCount: 0}], statTotals: {STR: 1}},
  {userId: 'another-owner'}, {p_user_id: 'another-owner'}, {unknown: true}]) {
  Deno.test(`client-supplied tracker text or owner is refused before any RPC: ${Object.keys(extra)[0]}`, async () => {
    const f = fixture({body: {action: 'weekly-summary', weekStart: '2026-10-19', processingAccess: access, ...extra}});
    const response = await f.call();
    assert(response.status === 400 && f.calls().length === 0 && f.counts().generated === 0, 'arbitrary body is not an input path');
  });
}

for (const [code, status] of [['ET002', 403], ['EP002', 403], ['EP001', 403], ['EM001', 403], ['EA001', 403], ['22023', 400]] as const) {
  Deno.test(`canonical input denial ${code} stops before admission, quota and provider`, async () => {
    const f = fixture({inputError: {code}}); const response = await f.call();
    assert(response.status === status, `status ${status}`);
    assert(!f.calls().includes('ai_admit_execution') && f.counts().generated === 0 && f.counts().refunds === 0, 'no quota receipt, refund or provider call');
  });
}
Deno.test('an unexpected canonical-input error is unavailable and never falls back to client data', async () => {
  const f = fixture({inputError: {code: 'XX000'}}); const response = await f.call();
  assert(response.status === 503 && !f.calls().includes('ai_admit_execution') && f.counts().generated === 0, 'fail closed');
});
for (const bad of [null, 'text', [], {habits: 'x', statTotals: {}}, {habits: [], statTotals: []}, {habits: [{name: 'n', stat: 'STR', fullCount: -1, easyCount: 0}], statTotals: {}},
  {habits: [], statTotals: {STR: 1.5}}, {...canonical, extra: true}]) {
  Deno.test(`malformed canonical response is rejected before admission: ${JSON.stringify(bad)?.slice(0, 40)}`, async () => {
    const f = fixture({input: bad}); const response = await f.call();
    assert(response.status === 503 && !f.calls().includes('ai_admit_execution') && f.counts().generated === 0, 'unverified server input is not forwarded');
  });
}
Deno.test('over-limit canonical input is rejected, not truncated', async () => {
  const habits = Array.from({length: 101}, (_, i) => ({name: `Quest ${i}`, stat: 'STR', fullCount: 1, easyCount: 0}));
  const f = fixture({input: {habits, statTotals: {STR: 101, INT: 0, DEX: 0, WIS: 0, CHA: 0}}}); const response = await f.call();
  assert(response.status === 400 && !f.calls().includes('ai_admit_execution') && f.counts().generated === 0, '101 habits refuse');
  const big = fixture({input: {habits: [{name: 'x'.repeat(30_000), stat: 'STR', fullCount: 1, easyCount: 0}], statTotals: {STR: 1, INT: 0, DEX: 0, WIS: 0, CHA: 0}}});
  const bigResponse = await big.call();
  assert(bigResponse.status === 400 && big.counts().generated === 0, 'byte limit refuses instead of truncating');
});
Deno.test('a consent change held between the canonical read and admission denies and refunds once', async () => {
  const f = fixture({begin: {...allowed, consentVersion: 3}}); const response = await f.call();
  assert(response.status === 403 && f.counts().generated === 0 && f.counts().refunds === 1, 'admission tuple mismatch still stops before the provider');
});
Deno.test('other actions never read canonical weekly input', async () => {
  const f = fixture({body: {action: 'easy-versions', habitName: 'Read', stat: 'INT'}}); await f.call();
  assert(!f.calls().includes('ai_tracker_week_input'), 'only the weekly command uses the server input');
});
