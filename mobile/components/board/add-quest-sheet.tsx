import { Pressable, StyleSheet, Text } from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

export type QuestTypeChoice = 'habit' | 'one_time' | 'backlog';

const CHOICES: Record<QuestTypeChoice, { title: string; hint: string; label: string }> = {
  habit: { title: 'HABIT QUEST', hint: 'Repeats on chosen days — build streaks', label: 'Create a habit quest' },
  one_time: { title: '1-TIME QUEST', hint: 'A todo for today only — done or gone, no streak', label: 'Create a 1-time quest' },
  backlog: { title: 'BACKLOG QUEST', hint: 'An idea with no date — move it to 1-Time when you are ready', label: 'Create a backlog quest' },
};

interface Props {
  visible: boolean;
  /** The kinds on offer, in order. */
  types: QuestTypeChoice[];
  onChoose: (type: QuestTypeChoice) => void;
  onClose: () => void;
}

/** Pick the kind of quest up front: what the editor shows depends on it. */
export function AddQuestSheet({ visible, types, onChoose, onClose }: Props) {
  const t = useTokens();
  return (
    <Sheet visible={visible} title="NEW QUEST" onClose={onClose} testID="board-type-chooser">
      <Text style={[styles.sub, { color: t['muted-flat'], fontFamily: fonts.body }]}>What kind of quest is this?</Text>
      {types.map((type, index) => (
        <Pressable
          key={type}
          accessibilityRole="button"
          accessibilityLabel={CHOICES[type].label}
          onPress={() => onChoose(type)}
          style={[
            styles.option,
            index === 0
              ? { borderColor: t['accent-border'], backgroundColor: t['accent-glass'] }
              : { borderColor: t['glass-border'], backgroundColor: 'transparent' },
          ]}>
          <Text style={[styles.optionTitle, { color: index === 0 ? t['accent-text'] : t.text, fontFamily: fonts.display }]}>{CHOICES[type].title}</Text>
          <Text style={[styles.optionHint, { color: t['muted-flat'], fontFamily: fonts.body }]}>{CHOICES[type].hint}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sub: { fontSize: 14, marginBottom: 12 },
  option: { minHeight: 64, borderWidth: 1, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10, gap: 4, justifyContent: 'center' },
  optionTitle: { fontSize: 16, letterSpacing: 1 },
  optionHint: { fontSize: 13, lineHeight: 18 },
});
