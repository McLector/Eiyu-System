import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchOrCreateWeeklySummary, formatError, regenerateWeeklySummary } from '@eiyu/shared';

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
  const t = useTokens();
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setError(null);
    fetchOrCreateWeeklySummary(userId, timeZone)
      .then(text => { if (!cancelled) setSummary(text); })
      .catch(err => { if (!cancelled) setError(formatError(err)); });
    return () => { cancelled = true; };
  }, [userId, timeZone, attempt]);

  const regenerate = async () => {
    if (!userId || regenerating || summary === null) return;
    setRegenerating(true);
    setRegenerateError(null);
    try {
      setSummary(await regenerateWeeklySummary(userId, timeZone));
    } catch (err) {
      const message = formatError(err);
      setRegenerateError(message.includes('regen cap reached') ? "You've used both regenerations for today — more tomorrow" : message);
    } finally {
      setRegenerating(false);
    }
  };

  const long = summary !== null && summary.length > SHORT_LIMIT;
  const shown = summary === null ? '' : expanded || !long ? summary : `${summary.slice(0, SHORT_LIMIT).trimEnd()}…`;

  return (
    <SignaturePanel style={styles.panel}>
      <View style={styles.head}>
        <SparkleIcon size={15} color={t['accent-text']} />
        <Text style={[styles.title, { color: t['accent-text'], fontFamily: fonts.display }]}>WEEKLY DEBRIEF</Text>
        <Button
          variant="secondary"
          label={regenerating ? 'REGENERATING…' : 'REGENERATE'}
          accessibilityLabel="Regenerate weekly summary"
          disabled={regenerating || summary === null}
          onPress={() => void regenerate()}
        />
      </View>
      {error ? (
        <View style={styles.errorBlock}>
          <Text accessibilityRole="alert" style={[styles.body, { color: t.danger, fontFamily: fonts.body }]}>{`The System couldn't reach the archive — ${error}`}</Text>
          <Button variant="secondary" label="RETRY" accessibilityLabel="Retry weekly summary" onPress={() => setAttempt(n => n + 1)} />
        </View>
      ) : summary === null ? (
        <Text style={[styles.body, { color: t['muted-flat'], fontFamily: fonts.body }]}>Reading the week&apos;s signs…</Text>
      ) : (
        <>
          {regenerateError ? <Text accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>{regenerateError}</Text> : null}
          <Text testID="weekly-summary-content" style={[styles.body, { color: t['muted-flat'], fontFamily: fonts.body }]}>{shown}</Text>
          {long ? (
            <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'SHOW LESS' : 'READ MORE'} onPress={() => setExpanded(v => !v)} style={styles.more}>
              <Text style={[styles.moreText, { color: t['accent-text'], fontFamily: fonts.display }]}>{expanded ? 'SHOW LESS ↑' : 'READ MORE ↓'}</Text>
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
