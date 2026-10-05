import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fetchWeeklyReview, WEEKLY_REVIEW_COPY, type WeeklyDayDatum } from '@eiyu/shared';

import { StateBlock } from '@/components/ui/state-block';
import WeeklyReviewMatrix from '@/components/weekly-review-matrix';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

/** The last seven days by stat. It reads when the Weekly view is first opened, and again on Retry. */
export function WeeklyPanel({ active, userId, timeZone }: { active: boolean; userId: string | undefined; timeZone: string }) {
  const t = useTokens();
  const [data, setData] = useState<WeeklyDayDatum[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active || !userId) return;
    let cancelled = false;
    setFailed(false);
    fetchWeeklyReview(userId, timeZone)
      .then(result => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [active, userId, timeZone, attempt]);

  return (
    <View>
      <Text style={[styles.eyebrow, { color: t['dim-flat'], fontFamily: fonts.display }]}>LAST 7 DAYS</Text>
      {failed ? (
        <StateBlock kind="error" onRetry={() => setAttempt(n => n + 1)}>{WEEKLY_REVIEW_COPY.error}</StateBlock>
      ) : data === null ? (
        <StateBlock kind="loading">Reading the week…</StateBlock>
      ) : (
        <WeeklyReviewMatrix data={data} colors={{ text: t.text, muted: t['muted-flat'], accent: t['accent-text'], track: t.track }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 11, letterSpacing: 1.4, marginBottom: 10 },
});
