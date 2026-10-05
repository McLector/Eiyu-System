import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DAYS, type Quest } from '@eiyu/shared';

import { MoreIcon } from '@/components/eiyu/icons';
import { Sheet } from '@/components/ui/sheet';
import { StateBlock } from '@/components/ui/state-block';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

interface Props {
  visible: boolean;
  habits: Quest[];
  /** Habits with an action running; their more button is held. */
  pendingIds: ReadonlySet<string>;
  onOpen: (quest: Quest) => void;
  onActions: (quest: Quest) => void;
  onClose: () => void;
}

function scheduleLine(quest: Quest): string {
  const days = quest.days.length === 7 ? 'Every day' : quest.days.map(day => DAYS[day]).join(', ') || 'No scheduled days';
  const done = quest.dailyEligible && quest.completed ? ' · Completed today' : '';
  const progress = quest.dailyEligible && quest.targetCount != null ? ` · ${quest.progressCount}/${quest.targetCount}` : '';
  return `${days}${done}${progress}`;
}

/** Every saved habit, including the ones that are not due today (they are not on the Daily lane). */
export function AllHabitsSheet({ visible, habits, pendingIds, onOpen, onActions, onClose }: Props) {
  const t = useTokens();
  return (
    <Sheet visible={visible} title="ALL HABITS" onClose={onClose} testID="all-habits-sheet">
      {habits.length === 0 ? (
        <StateBlock kind="empty">No saved habits yet. Add a recurring quest to build your catalog.</StateBlock>
      ) : habits.map(habit => {
        const status = habit.completed && habit.dailyEligible ? 'DONE' : habit.dailyEligible ? 'TODAY' : 'OFF DAY';
        const statusColor = status === 'DONE' ? t.success : status === 'TODAY' ? t['accent-text'] : t['dim-flat'];
        const busy = pendingIds.has(habit.id);
        return (
          <View key={habit.id} style={[styles.row, { borderBottomColor: t['divider-flat'] }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${habit.name} details`} onPress={() => onOpen(habit)} style={styles.info}>
              <Text style={[styles.name, { color: t.text, fontFamily: fonts.bodySemi }]}>{habit.name}</Text>
              <Text style={[styles.schedule, { color: t['muted-flat'], fontFamily: fonts.body }]}>{scheduleLine(habit)}</Text>
              <Text style={[styles.status, { color: statusColor, borderColor: t['glass-border'], fontFamily: fonts.display }]}>{status}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`More actions for ${habit.name}`}
              accessibilityState={{ disabled: busy, busy }}
              disabled={busy}
              onPress={() => onActions(habit)}
              style={[styles.more, busy && styles.dimmed]}>
              <MoreIcon size={20} color={t['muted-flat']} />
            </Pressable>
          </View>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  info: { flex: 1, minHeight: 48, paddingVertical: 10, gap: 3, alignItems: 'flex-start' },
  name: { fontSize: 15 },
  schedule: { fontSize: 12 },
  status: { fontSize: 10, letterSpacing: 1, borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, marginTop: 2 },
  more: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.5 },
});
