import { nextMidnightMs, parseProviders } from './ai-proxy-providers.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function envOf(values: Record<string, string>): (name: string) => string | undefined {
  return name => values[name];
}

function parse(list: unknown, extra: Record<string, string> = {}) {
  const logs: string[] = [];
  const providers = parseProviders(envOf({ AI_PROVIDERS: typeof list === 'string' ? list : JSON.stringify(list), ...extra }), message => logs.push(message));
  return { providers, logs };
}

const gemini = { name: 'gemini', kind: 'gemini', model: 'gemini-test', keyEnv: 'GEMINI_API_KEY' };
const groq = { name: 'groq', kind: 'openai', baseUrl: 'https://api.groq.test/openai/v1/', model: 'llama-test', keyEnv: 'GROQ_API_KEY' };

Deno.test('no AI_PROVIDERS secret means the implicit single-provider mode', () => {
  const logs: string[] = [];
  assert(parseProviders(envOf({}), message => logs.push(message)) === null, 'unset must return null');
  assert(parseProviders(envOf({ AI_PROVIDERS: '   ' }), message => logs.push(message)) === null, 'blank must return null');
  assert(logs.length === 0, 'an unset secret is normal and must not log');
});

Deno.test('a valid list keeps its order and fills in defaults', () => {
  const { providers, logs } = parse([groq, gemini]);
  assert(providers !== null && providers.length === 2, 'both providers are kept');
  assert(providers[0].name === 'groq' && providers[1].name === 'gemini', 'order is preserved');
  assert(providers[0].baseUrl === 'https://api.groq.test/openai/v1', 'a trailing slash is trimmed');
  assert(providers[0].resetTimeZone === 'UTC', 'openai providers reset on UTC by default');
  assert(providers[1].resetTimeZone === 'America/Los_Angeles', 'Gemini resets at midnight Pacific');
  assert(providers[1].baseUrl === 'https://generativelanguage.googleapis.com/v1beta/models', 'gemini gets the Google endpoint');
  assert(logs.length === 0, 'a clean list logs nothing');
});

Deno.test('resetTimeZone is honoured when valid and dropped when not', () => {
  const ok = parse([{ ...groq, resetTimeZone: 'Asia/Manila' }]);
  assert(ok.providers?.[0].resetTimeZone === 'Asia/Manila', 'a valid zone is kept');
  const bad = parse([{ ...groq, resetTimeZone: 'Not/AZone' }, gemini]);
  assert(bad.providers?.length === 1 && bad.providers[0].name === 'gemini', 'an entry with an unknown zone is dropped');
  assert(bad.logs.some(line => line.includes('resetTimeZone')), 'the log names the bad field');
});

Deno.test('each invalid field drops only its own entry and the log names the field, never the value', () => {
  const secret = 'sk-super-secret-value';
  const cases: Array<[string, Record<string, unknown>]> = [
    ['name', { ...groq, name: 'Bad Name!' }],
    ['name', { ...groq, name: '' }],
    ['kind', { ...groq, kind: 'anthropic' }],
    ['model', { ...groq, model: '' }],
    ['model', { ...groq, model: undefined }],
    ['keyEnv', { ...groq, keyEnv: 'lower-case' }],
    ['keyEnv', { ...groq, keyEnv: secret }],
    ['baseUrl', { ...groq, baseUrl: 'http://insecure.test/v1' }],
    ['baseUrl', { ...groq, baseUrl: undefined }],
    ['baseUrl', { ...groq, baseUrl: 'not a url' }],
  ];
  for (const [field, entry] of cases) {
    const { providers, logs } = parse([entry, gemini]);
    assert(providers?.length === 1 && providers[0].name === 'gemini', `a bad ${field} drops the entry`);
    assert(logs.some(line => line.includes(field) && line.includes('entry 0')), `the log names entry 0 and ${field}`);
    assert(!logs.some(line => line.includes(secret) || line.includes('insecure.test')), 'values never reach the log');
  }
});

Deno.test('non-object entries and duplicate names are dropped', () => {
  const { providers, logs } = parse([null, 'text', 7, [], gemini, { ...groq, name: 'gemini' }]);
  assert(providers?.length === 1 && providers[0].name === 'gemini', 'only the first valid gemini survives');
  assert(logs.length === 5, 'each rejected entry logs once');
});

Deno.test('invalid JSON, a non-array, or an empty result falls back to implicit mode and says so', () => {
  for (const value of ['{not json', '{"a":1}', '[]', '[{"name":"x"}]']) {
    const { providers, logs } = parse(value);
    assert(providers === null, `${value} must fall back`);
    assert(logs.length > 0, `${value} must log loudly`);
  }
});

Deno.test('the list is capped so a huge secret cannot create unbounded work', () => {
  const many = Array.from({ length: 30 }, (_, index) => ({ ...groq, name: `p${index}` }));
  const { providers } = parse(many);
  assert(providers !== null && providers.length === 8, 'at most eight providers are used');
});

Deno.test('nextMidnightMs matches the SQL helper for UTC, Pacific and a zone ahead of UTC', () => {
  const at = (iso: string) => Date.parse(iso);
  assert(nextMidnightMs('UTC', at('2026-10-07T13:00:00Z')) === at('2026-10-08T00:00:00Z'), 'UTC');
  assert(nextMidnightMs('America/Los_Angeles', at('2026-10-08T00:30:00Z')) === at('2026-10-08T07:00:00Z'), 'Pacific before its midnight');
  assert(nextMidnightMs('America/Los_Angeles', at('2026-10-08T08:00:00Z')) === at('2026-10-09T07:00:00Z'), 'Pacific just after its midnight');
  assert(nextMidnightMs('Asia/Manila', at('2026-10-07T17:00:00Z')) === at('2026-10-08T16:00:00Z'), 'Manila');
  assert(nextMidnightMs('America/Los_Angeles', at('2026-11-01T12:00:00Z')) === at('2026-11-02T08:00:00Z'), 'across the November DST change Pacific midnight is 08:00 UTC');
});
