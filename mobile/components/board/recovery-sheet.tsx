import { StyleSheet, Text, View } from 'react-native';
import { recoveryDeadlineLabel, type Quest } from '@eiyu/shared';

import { FrostMark } from '@/components/ui/frost-mark';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

interface Props {
  visible: boolean;
  /** Habits whose streak is frozen and can still be recovered. */
  quests: Quest[];
  onComplete: (id: string) => void;
  onClose: () => void;
}

/** Frozen streaks: the penalty to do, how long is left, and the button that completes the recovery. */
export function RecoverySheet({ visible, quests, onComplete, onClose }: Props) {
  const t = useTokens();
  return (
    <Sheet visible={visible} title="RECOVERY REQUIRED" onClose={onClose} testID="recovery-sheet">
      {quests.map(quest => (
        <View key={quest.id} style={[styles.card, { borderColor: t['ice-border'], backgroundColor: t['panel-flat'] }]}>
          <View style={styles.header}>
            <View style={styles.title}>
              <FrostMark size={15} />
              <Text style={[styles.frozen, { color: t.ice, fontFamily: fonts.display }]}>Streak frozen</Text>
            </View>
            <Text style={[styles.deadline, { color: t.ice, fontFamily: fonts.mono }]}>{recoveryDeadlineLabel(quest)}</Text>
          </View>
          <Text style={[styles.name, { color: t.text, fontFamily: fonts.bodySemi }]}>{quest.name}</Text>
          <Text style={[styles.penalty, { color: t['muted-flat'], fontFamily: fonts.body }]}>{`Penalty: ${quest.easyVersion}`}</Text>
          <Button
            variant="secondary"
            label="Mark Recovery Complete"
            accessibilityLabel={`Mark recovery complete for ${quest.name}`}
            onPress={() => onComplete(quest.id)}
          />
        </View>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 4, padding: 12, gap: 6, marginBottom: 10 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  frozen: { fontSize: 13, letterSpacing: 1 },
  deadline: { fontSize: 12 },
  name: { fontSize: 16 },
  penalty: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
});
