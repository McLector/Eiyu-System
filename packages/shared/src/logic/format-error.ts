/** Supabase's PostgrestError isn't an Error instance, just {message, code, ...}. */
export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    return 'message' in err && typeof err.message === 'string' ? err.message : 'Unknown error';
  }
  if (err === null || err === undefined) return 'Unknown error';
  return String(err);
}
