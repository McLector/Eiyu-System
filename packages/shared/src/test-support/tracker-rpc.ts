/**
 * Test-only: a Supabase rpc builder double. It is awaitable like a PostgREST builder, and records the headers a
 * caller pinned with setHeader so a test can prove which session a request was bound to.
 */
export interface TrackerRpcDouble extends PromiseLike<unknown> {
  headers: Record<string, string>;
  setHeader(name: string, value: string): TrackerRpcDouble;
}
export function trackerRpcDouble(result: unknown): TrackerRpcDouble {
  const headers: Record<string, string> = {};
  const settled = Promise.resolve(result);
  const double: TrackerRpcDouble = {
    headers,
    setHeader(name, value) { headers[name] = value; return double; },
    then: (onFulfilled, onRejected) => settled.then(onFulfilled, onRejected),
  };
  return double;
}
export const OWNER_A = 'da230000-0000-4000-8000-000000000001';
export const OWNER_B = 'da230000-0000-4000-8000-000000000002';
