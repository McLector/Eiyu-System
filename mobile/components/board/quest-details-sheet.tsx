import { StyleSheet, Text, View } from 'react-native';
import { QUEST_TYPE_LABEL, questGenreLabel, questScheduleLabel, STAT_COLORS, type Quest } from '@eiyu/shared';

import { EditIcon, StatIcon } from '@/components/eiyu/icons';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

interface Props {
  quest: Quest | null;
  /** The account's current date key, so "Today" follows the account and not the phone's clock. */
  accountToday: string;
  onClose: () => void;
  onEdit: () => void;
}

/** Read-only details, opened from a row. Editing is a separate, explicit step. */
export function QuestDetailsSheet({ quest, accountToday, onClose, onEdit }: Props) {
  const t = useTokens();
  const genre = quest ? questGenreLabel(quest.genre) : null;
  return (
    <Sheet
      visible={quest !== null}
      title="QUEST DETAILS"
      onClose={onClose}
      testID="quest-details"
      footer={quest ? (
        <View style={styles.actions}>
          <Button variant="primary" label="Edit quest" icon={<EditIcon size={14} color={t['on-accent']} />} onPress={onEdit} />
        </View>
      ) : undefined}>
      {quest ? (
        <View style={styles.body}>
          <View style={styles.chips}>
            <View style={[styles.chip, { borderColor: t['glass-border'] }]}>
              <StatIcon stat={quest.stat} size={12} />
              <Text style={[styles.chipText, { color: STAT_COLORS[quest.stat], fontFamily: fonts.display }]}>{quest.stat}</Text>
            </View>
            <Text style={[styles.chip, styles.chipText, { color: t['muted-flat'], borderColor: t['glass-border'], fontFamily: fonts.body }]}>{quest.difficulty}</Text>
            {genre ? <Text style={[styles.chip, styles.chipText, { color: t['muted-flat'], borderColor: t['glass-border'], fontFamily: fonts.body }]}>{genre}</Text> : null}
            <Text style={[styles.chip, styles.chipText, { color: t['muted-flat'], borderColor: t['glass-border'], fontFamily: fonts.body }]}>{QUEST_TYPE_LABEL[quest.questType]}</Text>
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>{quest.name}</Text>
          <Text style={[styles.schedule, { color: t['muted-flat'], fontFamily: fonts.body }]}>
            {`${questScheduleLabel(quest, accountToday)}${quest.streak > 0 ? ` · ${quest.streak}-day streak` : ''}`}
          </Text>
          {quest.description ? (
            <View style={styles.section}>
              <Text style={[styles.label, { color: t['dim-flat'], fontFamily: fonts.display }]}>NOTE</Text>
              <Text style={[styles.note, { color: t.text, fontFamily: fonts.body }]}>{quest.description}</Text>
            </View>
          ) : null}
          {quest.questType === 'habit' && quest.easyVersion ? (
            <View style={styles.section}>
              <Text style={[styles.label, { color: t['dim-flat'], fontFamily: fonts.display }]}>PENALTY</Text>
              <Text style={[styles.note, { color: t.text, fontFamily: fonts.body }]}>{quest.easyVersion}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  chipText: { fontSize: 11, letterSpacing: 0.6 },
  title: { fontSize: 22, letterSpacing: 0.6 },
  schedule: { fontSize: 13 },
  section: { gap: 4 },
  label: { fontSize: 11, letterSpacing: 1.2 },
  note: { fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
