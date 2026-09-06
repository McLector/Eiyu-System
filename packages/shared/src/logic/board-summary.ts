/**
 * Hunter-voice line for a daily completion count — replaces a flat "N / M
 * quests" readout with in-world framing (redesign spec section 5). Lives in
 * shared/ rather than the web screen file so it can be unit-tested without
 * pulling in the web app's Supabase-backed store module graph.
 */
export function boardSummaryLine(completed: number, total: number): string {
  if (total === 0) return 'No quests scheduled today.';
  if (completed === 0) return 'The board is quiet — no answers yet.';
  if (completed === total) return 'The board answered in full.';
  return `${completed} of ${total} have answered the call.`;
}
