import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import PagerView from 'react-native-pager-view';

import HabitHeatmap from '@/components/status/habit-heatmap';
import { HeroPanel } from '@/components/status/hero-panel';
import { StatBars } from '@/components/status/stat-bars';
import { WeeklyDebrief } from '@/components/status/weekly-debrief';
import { WeeklyPanel } from '@/components/status/weekly-panel';
import { Segmented } from '@/components/ui/segmented';
import { fonts } from '@/constants/eiyu-theme';
import { useAuth } from '@/contexts/auth-store';
import { useEiyu } from '@/contexts/eiyu-store';
import { useTokens } from '@/contexts/theme-store';

type View3 = 'hero' | 'stats' | 'weekly';
const VIEWS: { value: View3; label: string }[] = [
  { value: 'hero', label: 'HERO' },
  { value: 'stats', label: 'STATS' },
  { value: 'weekly', label: 'WEEKLY' },
];

export default function StatusScreen() {
  const t = useTokens();
  const { user } = useEiyu();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [view, setView] = useState<View3>('stats');
  const pagerRef = useRef<PagerView>(null);

  // The segmented control and a swipe both end up here: keep the pager on the chosen view.
  useEffect(() => {
    pagerRef.current?.setPage?.(VIEWS.findIndex(item => item.value === view));
  }, [view]);

  const page = (value: View3, children: React.ReactNode) => {
    const active = view === value;
    return (
      <View
        key={value}
        collapsable={false}
        accessibilityElementsHidden={!active}
        importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
        style={styles.page}>
        <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: t['page-flat'] }]}>
      <View style={styles.top}>
        <Segmented options={VIEWS} value={view} onChange={setView} accessibilityLabel="Status views" />
      </View>
      <PagerView
        testID="status-pager"
        ref={pagerRef}
        style={styles.pager}
        initialPage={1}
        onPageSelected={(event: { nativeEvent: { position: number } }) => {
          const next = VIEWS[event.nativeEvent.position];
          if (next) setView(next.value);
        }}>
        {page('hero', <HeroPanel user={user} />)}
        {page('stats', (
          <>
            <View>
              <Text style={[styles.eyebrow, { color: t['dim-flat'], fontFamily: fonts.display }]}>ATTRIBUTE PROGRESS</Text>
              <StatBars stats={user.stats} />
            </View>
            <HabitHeatmap userId={userId} timeZone={user.timeZone} />
          </>
        ))}
        {page('weekly', (
          <>
            <WeeklyPanel active={view === 'weekly'} userId={userId} timeZone={user.timeZone} />
            <WeeklyDebrief userId={userId} timeZone={user.timeZone} />
          </>
        ))}
      </PagerView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { paddingHorizontal: 16, paddingTop: 12 },
  pager: { flex: 1, marginTop: 8 },
  page: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 16, gap: 20 },
  eyebrow: { fontSize: 11, letterSpacing: 1.4, marginBottom: 4 },
});
