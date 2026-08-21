/** Supabase's PostgrestError isn't an Error instance, just {message, code, ...}. */
export function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return String(err);
}
