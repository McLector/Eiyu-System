import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { fetchOrCreateWeeklySummary, formatError, regenerateWeeklySummary, subscribeAccountAgeChanges, subscribeMailboxChanges, MAILBOX_MESSAGE } from '@eiyu/shared';
import {fetchProcessingAccess, fetchSavedWeeklySummary, fetchMailboxStatus, subscribeProcessingAccessChanges, PROCESSING_ACCESS_MESSAGE, type ProcessingAccess} from '@eiyu/shared';
import { MailboxVerification } from './mailbox-verification';
import {DebriefConsent} from './debrief-consent';

import { SparkleIcon } from '@/components/eiyu/icons';
import { Button } from '@/components/ui/button';
import { SignaturePanel } from '@/components/ui/signature-panel';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

const SHORT_LIMIT = 160;

/**
 * The AI weekly debrief. The summary is requested as soon as Status opens (not when the Weekly view is chosen): generating
 * one is a cold chain of reads, an Edge Function and a model call, and starting early hides that behind the other views.
 */
export function WeeklyDebrief({ userId, timeZone }: { userId: string | undefined; timeZone: string }) {
  return <AccountWeeklyDebrief key={`${userId}:${timeZone}`} userId={userId} timeZone={timeZone} />;
}
function AccountWeeklyDebrief({ userId, timeZone }: { userId: string | undefined; timeZone: string }) {
  const t = useTokens();
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<ProcessingAccess | null>(null);
  const revision = useRef(0);
  useEffect(() => {
    const invalidate = () => { revision.current++; };
    const refresh = () => { invalidate(); setSummary(null); setError(current => current?.includes(MAILBOX_MESSAGE) ? current : null); setRegenerateError(null); setRegenerating(false); setAttempt(n => n + 1); };
    const unsubscribe = subscribeAccountAgeChanges(refresh);
    const mailbox = subscribeMailboxChanges(refresh);
    const permissions = subscribeProcessingAccessChanges(refresh);
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { invalidate(); unsubscribe(); mailbox(); permissions(); foreground.remove(); };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const current = revision.current;
    setSummary(null);
    setError(current => current?.includes(MAILBOX_MESSAGE) ? current : null);
    const load = async () => {
      const access = await fetchProcessingAccess();
      if (cancelled || current !== revision.current) return null;
      if (access.userId !== userId) throw new Error(PROCESSING_ACCESS_MESSAGE);
      setProcessing(access);
      if (access.canGenerateDebrief) return fetchOrCreateWeeklySummary(userId, timeZone);
      if (access.canReadDebrief) return fetchSavedWeeklySummary(userId, timeZone);
      const mailbox = await fetchMailboxStatus();
      if (cancelled || current !== revision.current) return null;
      if (mailbox.userId !== userId) throw new Error(PROCESSING_ACCESS_MESSAGE);
      throw new Error(!mailbox.verified ? MAILBOX_MESSAGE : PROCESSING_ACCESS_MESSAGE);
    };
    load()
      .then(text => { if (!cancelled) { setError(null); setSummary(text); } })
      .catch(err => { if (!cancelled) setError(formatError(err)); });
    return () => { cancelled = true; };
  }, [userId, timeZone, attempt]);

  const regenerate = async () => {
    if (!userId || regenerating || summary === null || !processing?.canGenerateDebrief) return;
    const current = revision.current;
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const next = await regenerateWeeklySummary(userId, timeZone);
      if (revision.current === current) setSummary(next);
    } catch (err) {
      if (revision.current !== current) return;
      const message = formatError(err);
      setRegenerateError(message.includes('regen cap reached') ? "You've used both regenerations for today — more tomorrow" : message);
    } finally {
      if (revision.current === current) setRegenerating(false);
    }
  };

  const long = summary !== null && summary.length > SHORT_LIMIT;
  const shown = summary === null ? '' : expanded || !long ? summary : `${summary.slice(0, SHORT_LIMIT).trimEnd()}…`;

  return (
    <SignaturePanel style={styles.panel}>
      <View style={styles.head}>
        <SparkleIcon size={15} color={t['accent-text']} />
        <AppText style={[styles.title, { color: t['accent-text'], fontFamily: fonts.display }]}>WEEKLY DEBRIEF</AppText>
        <Button
          variant="secondary"
          label={regenerating ? 'REGENERATING…' : 'REGENERATE'}
          accessibilityLabel="Regenerate weekly summary"
          disabled={regenerating || summary === null || !processing?.canGenerateDebrief}
          onPress={() => void regenerate()}
        />
      </View>
      {processing && userId ? <DebriefConsent userId={userId} access={processing} onChanged={setProcessing}/> : null}
      {error?.includes(MAILBOX_MESSAGE) && userId ? (
        <MailboxVerification userId={userId} refreshRevision={attempt} onVerified={() => setAttempt(n => n + 1)} />
      ) : error ? (
        <View style={styles.errorBlock}>
          <AppText accessibilityRole="alert" style={[styles.body, { color: t.danger, fontFamily: fonts.body }]}>{`The System couldn't reach the archive — ${error}`}</AppText>
          <Button variant="secondary" label="RETRY" accessibilityLabel="Retry weekly summary" onPress={() => setAttempt(n => n + 1)} />
        </View>
      ) : processing && !processing.canGenerateDebrief && summary === null ? (
        <AppText style={[styles.body, {color: t['muted-flat'], fontFamily: fonts.body}]}>AI permission is off. Ordinary quests remain available. Saved debriefs appear here when reading is permitted.</AppText>
      ) : summary === null ? (
        <AppText style={[styles.body, { color: t['muted-flat'], fontFamily: fonts.body }]}>Reading the week&apos;s signs…</AppText>
      ) : (
        <>
          {regenerateError ? <AppText accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>{regenerateError}</AppText> : null}
          <AppText testID="weekly-summary-content" style={[styles.body, { color: t['muted-flat'], fontFamily: fonts.body }]}>{shown}</AppText>
          {long ? (
            <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'SHOW LESS' : 'READ MORE'} onPress={() => setExpanded(v => !v)} style={styles.more}>
              <AppText style={[styles.moreText, { color: t['accent-text'], fontFamily: fonts.display }]}>{expanded ? 'SHOW LESS ↑' : 'READ MORE ↓'}</AppText>
            </Pressable>
          ) : null}
        </>
      )}
    </SignaturePanel>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { flex: 1, fontSize: 12, letterSpacing: 1.2 },
  body: { fontSize: 14, lineHeight: 22 },
  note: { fontSize: 12, lineHeight: 17 },
  errorBlock: { gap: 8 },
  more: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  moreText: { fontSize: 12, letterSpacing: 1 },
});
