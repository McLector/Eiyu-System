import { generateWeeklySummary } from '../ai/suggestions';
import { supabase } from '../supabase/client';
import { accountDateKey, mondayDateKey } from '../logic/date-utils';
import {requireDebriefAccess, PROCESSING_ACCESS_MESSAGE, type ProcessingAccess} from './processing-access';
import { requireMailboxProof, MAILBOX_MESSAGE, type MailboxStatus } from './mailbox';
import { authorizationForOwner } from '../supabase/authorization';

async function debriefContext(userId: string, kind: 'read' | 'generate') {
  const mailbox = await requireMailboxProof();
  if (mailbox.userId !== userId) throw new Error(MAILBOX_MESSAGE);
  const access = await requireDebriefAccess(kind);
  if (access.userId !== userId) throw new Error(PROCESSING_ACCESS_MESSAGE);
  const authorization = await authorizationForOwner(userId, PROCESSING_ACCESS_MESSAGE);
  return {access, mailbox, authorization};
}
async function checkAccess(kind: 'read' | 'generate', access: ProcessingAccess, mailbox: MailboxStatus): Promise<void> {
  await requireDebriefAccess(kind, access);
  await requireMailboxProof(mailbox);
}
function provenance(access: ProcessingAccess) {
  return {age_version: access.ageVersion, mailbox_version: access.mailboxVersion,
    consent_version: access.consentVersion, authority_version: access.authorityVersion};
}

/** Read only: withdrawing optional generation permission does not request history deletion. */
export async function fetchSavedWeeklySummary(userId: string, timeZone: string, now: Date = new Date()): Promise<string | null> {
  const {access, mailbox, authorization} = await debriefContext(userId, 'read');
  const weekStart = mondayDateKey(accountDateKey(now, timeZone));
  const {data, error} = await supabase.from('weekly_summaries').select('summary')
    .eq('user_id', userId).eq('week_start', weekStart).setHeader('Authorization', authorization).maybeSingle();
  if (error) throw error;
  await checkAccess('read', access, mailbox);
  return data?.summary ?? null;
}

/**
 * R-60: fetches this week's AI summary paragraph, generating one (from the
 * week-to-date's completion data) the first time it's read in a given week -
 * cached in weekly_summaries so the paragraph is stable and isn't
 * regenerated on every Status screen visit.
 */
export async function fetchOrCreateWeeklySummary(
  userId: string,
  timeZone: string,
  now: Date = new Date()
): Promise<string> {
  const {access, mailbox, authorization} = await debriefContext(userId, 'read');
  const weekStart = mondayDateKey(accountDateKey(now, timeZone));

  const { data: existing, error: fetchError } = await supabase
    .from('weekly_summaries')
    .select('summary')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .setHeader('Authorization', authorization)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (existing) {
    await checkAccess('read', access, mailbox);
    return existing.summary;
  }

  await checkAccess('generate', access, mailbox);
  const summary = await generateWeeklySummary(weekStart, {access, mailbox});
  await checkAccess('generate', access, mailbox);

  const { error: insertError } = await supabase
    .from('weekly_summaries')
    .insert({ user_id: userId, week_start: weekStart, summary, ...provenance(access) })
    .setHeader('Authorization', authorization);
  // Unique constraint on (user_id, week_start): a second tab racing to
  // generate the same week's summary loses the insert, not the read - just
  // trust whatever won rather than showing two different paragraphs.
  if (insertError && insertError.code !== '23505') throw insertError;
  if (insertError) {
    const { data: winner, error: refetchError } = await supabase
      .from('weekly_summaries')
      .select('summary')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .setHeader('Authorization', authorization)
      .single();
    if (refetchError) throw refetchError;
    await checkAccess('read', access, mailbox);
    return winner.summary;
  }

  await checkAccess('generate', access, mailbox);
  return summary;
}

/**
 * Slice 2.1: user-triggered regeneration, capped server-side at 2/day.
 * Reserves a regen slot via the atomic RPC BEFORE calling the AI proxy, so a
 * rejected reservation (cap already spent) never burns a Gemini call. Only
 * writes the new summary back once both the reservation and the generation
 * succeed.
 */
export async function regenerateWeeklySummary(
  userId: string,
  timeZone: string,
  now: Date = new Date()
): Promise<string> {
  const {access, mailbox, authorization} = await debriefContext(userId, 'generate');
  const weekStart = mondayDateKey(accountDateKey(now, timeZone));

  const { error: reserveError } = await supabase.rpc('reserve_weekly_summary_regen', {
    p_week_start: weekStart,
  }).setHeader('Authorization', authorization);
  if (reserveError) throw reserveError;

  await checkAccess('generate', access, mailbox);
  const summary = await generateWeeklySummary(weekStart, {access, mailbox});
  await checkAccess('generate', access, mailbox);

  const { error: updateError } = await supabase
    .from('weekly_summaries')
    .update({ summary, ...provenance(access) })
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .setHeader('Authorization', authorization);
  if (updateError) throw updateError;
  await checkAccess('generate', access, mailbox);
  return summary;
}
