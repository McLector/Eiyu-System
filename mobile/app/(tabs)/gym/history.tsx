import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fetchGymHistory, formatError, GYM_COPY } from '@eiyu/shared';

import { ChevronIcon } from '@/components/eiyu/icons';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { StateBlock } from '@/components/ui/state-block';
import { fonts } from '@/constants/eiyu-theme';
import { useGym } from '@/contexts/gym-store';
import { useTokens } from '@/contexts/theme-store';


/** Completed workouts, newest first, ten to a page, optionally for one routine. */
export default function GymHistoryScreen() {
  const t = useTokens();
  const { userId, allRoutines } = useGym();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['gym-history', userId, filter, page],
    queryFn: () => fetchGymHistory(userId!, page, filter || undefined),
    enabled: !!userId,
  });
  const deleted = (id: string) => !!allRoutines.find(r => r.id === id)?.deleted_at;

  return (
    <ScrollView style={{ backgroundColor: t['page-flat'] }} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Gym" onPress={() => router.back()} style={styles.back}>
          <ChevronIcon direction="left" size={20} color={t['muted-flat']} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>WORKOUT HISTORY</Text>
      </View>

      <View accessibilityRole="radiogroup" accessibilityLabel="Workouts" style={styles.filters}>
        <Chip label="All workouts" selected={filter === ''} onPress={() => { setFilter(''); setPage(0); setOpen(null); }} />
        {allRoutines.map(r => {
          const label = r.deleted_at ? `${r.name} (deleted routine)` : r.name;
          return <Chip key={r.id} label={label} selected={filter === r.id} onPress={() => { setFilter(r.id); setPage(0); setOpen(null); }} />;
        })}
      </View>

      {query.isPending ? (
        <StateBlock kind="loading">{GYM_COPY.loadingHistory}</StateBlock>
      ) : query.isError ? (
        <StateBlock kind="error" retryLabel="Retry" onRetry={() => void query.refetch()}>{formatError(query.error)}</StateBlock>
      ) : (
        <>
          {query.data.sessions.length === 0 ? <StateBlock kind="empty">{GYM_COPY.emptyHistory}</StateBlock> : null}
          {query.data.sessions.map(session => {
            const expanded = open === session.id;
            const when = new Date(session.completed_at!).toLocaleString();
            const title = `${session.routine_name}${deleted(session.routine_id) ? ' · Deleted routine' : ''} · ${when} · ${session.unit}`;
            return (
              <View key={session.id} style={[styles.session, { borderBottomColor: t['divider-flat'] }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={title}
                  accessibilityState={{ expanded }}
                  onPress={() => setOpen(expanded ? null : session.id)}
                  style={styles.sessionHead}>
                  <Text style={[styles.sessionText, { color: t.text, fontFamily: fonts.display }]}>{title}</Text>
                  <ChevronIcon direction={expanded ? 'down' : 'right'} size={16} color={t['muted-flat']} />
                </Pressable>
                {expanded ? query.data.entries.filter(e => e.session_id === session.id).map(entry => (
                  <Text key={entry.id} style={[styles.entry, { color: t['muted-flat'], fontFamily: fonts.mono }]}>
                    {`${entry.prescription.name} · ${entry.prescription.sets} × ${entry.prescription.reps} · ${entry.weight ?? '—'} ${session.unit}`}
                  </Text>
                )) : null}
              </View>
            );
          })}
          <View testID="gym-history-pages" accessibilityLabel="Workout history pages" style={styles.pages}>
            <Button variant="secondary" label="Previous" accessibilityLabel="Previous page" disabled={page === 0} onPress={() => setPage(p => p - 1)} />
            <Text style={[styles.pageNo, { color: t.text, fontFamily: fonts.mono }]}>{page + 1}</Text>
            <Button variant="secondary" label="Next" accessibilityLabel="Next page" disabled={!query.data.hasNext} onPress={() => setPage(p => p + 1)} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, letterSpacing: 1 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  session: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8, gap: 6 },
  sessionHead: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionText: { flex: 1, fontSize: 14, lineHeight: 20 },
  entry: { fontSize: 12, lineHeight: 18, paddingLeft: 8 },
  pages: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pageNo: { fontSize: 14 },
});
