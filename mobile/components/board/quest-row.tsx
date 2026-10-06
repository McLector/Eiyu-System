import { Pressable, StyleSheet, Text, View } from 'react-native';
import { questGenreLabel, questWhenLabel, STAT_COLORS, type Quest } from '@eiyu/shared';

import { AlertIcon, CheckIcon, ClockIcon, MoreIcon, SnowflakeIcon, StatIcon } from '@/components/eiyu/icons';
import { FireStreak } from '@/components/ui/fire-streak';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';
import { SYNC_TAG_TEXT, type SyncState } from '@/lib/write-queue';

const SYNC_TAGS: Record<SyncState, { text: string; spoken: string }> = {
  pending: { text: SYNC_TAG_TEXT.pending, spoken: ', waiting to sync' },
  checking: { text: SYNC_TAG_TEXT.checking, spoken: ', checking' },
  failed: { text: SYNC_TAG_TEXT.failed, spoken: ', not saved' },
};

interface Props {
  quest: Quest;
  /** An action on this quest (archive, move, delete) is running: its controls are held. */
  pending: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onAdjustProgress: (delta: number) => void;
  onActions: () => void;
  /** XP just earned, flashed on the row. */
  xpToast?: number | null;
  /** A change to this quest that has not reached the server, or could not. Quiet when absent. */
  syncState?: SyncState;
}

/**
 * One quest in a lane: a check (or a stepper for a quest with a target), the title and its details, and a more button.
 * The title is its own accessibility element so the check and the more button stay reachable for a screen reader.
 */
export function QuestRow({ quest, pending, onToggle, onOpen, onAdjustProgress, onActions, xpToast = null, syncState }: Props) {
  const t = useTokens();
  const completed = quest.completed;
  const frozen = quest.frozen && !completed;
  const isBacklog = quest.questType === 'backlog';
  const genre = isBacklog || quest.questType === 'one_time' ? questGenreLabel(quest.genre) : null;
  const statColor = STAT_COLORS[quest.stat];
  const sync = syncState ? SYNC_TAGS[syncState] : null;
  const syncColor = syncState === 'failed' ? t.danger : t['muted-flat'];

  return (
    <View style={[styles.row, { borderBottomColor: t['divider-flat'], opacity: completed ? 0.55 : 1 }]}>
      <View style={styles.control}>
        {isBacklog ? null : quest.targetCount == null ? (
          <Pressable
            testID="quest-checkbox"
            accessibilityRole="checkbox"
            accessibilityLabel={`${quest.name}${completed ? ' (completed)' : ''}${sync?.spoken ?? ''}`}
            accessibilityState={{ checked: completed, disabled: pending }}
            disabled={pending}
            onPress={onToggle}
            style={styles.checkHit}>
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: completed ? t['success-border'] : frozen ? t['ice-border'] : t['accent-border'],
                  backgroundColor: completed ? t['success-glass'] : 'transparent',
                },
              ]}>
              {completed ? <CheckIcon size={14} color={t.success} /> : null}
            </View>
          </Pressable>
        ) : (
          <View style={styles.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Decrease progress for ${quest.name}`}
              disabled={pending || quest.progressCount <= 0}
              onPress={() => onAdjustProgress(-1)}
              style={[styles.stepButton, { borderColor: t['accent-border'], opacity: pending || quest.progressCount <= 0 ? 0.4 : 1 }]}>
              <Text style={[styles.stepGlyph, { color: t.text }]}>−</Text>
            </Pressable>
            <Text style={[styles.progress, { color: completed ? t.success : t.text, fontFamily: fonts.mono }]}>{`${quest.progressCount}/${quest.targetCount}`}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Increase progress for ${quest.name}`}
              disabled={pending || quest.progressCount >= quest.targetCount}
              onPress={() => onAdjustProgress(1)}
              style={[styles.stepButton, { borderColor: t['accent-border'], opacity: pending || quest.progressCount >= quest.targetCount ? 0.4 : 1 }]}>
              <Text style={[styles.stepGlyph, { color: t.text }]}>+</Text>
            </Pressable>
          </View>
        )}
      </View>

      <Pressable
        testID="quest-edit-trigger"
        accessibilityRole="button"
        accessibilityLabel={`Open ${quest.name} details${sync?.spoken ?? ''}`}
        accessibilityActions={[{ name: 'actions', label: 'More actions' }]}
        onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'actions') onActions(); }}
        onPress={onOpen}
        onLongPress={onActions}
        style={styles.info}>
        <Text
          numberOfLines={2}
          style={[
            styles.name,
            { color: completed ? t['muted-flat'] : t.text, textDecorationLine: completed ? 'line-through' : 'none', fontFamily: fonts.bodySemi },
          ]}>
          {quest.name}
        </Text>
        <View style={styles.meta}>
          <View style={styles.chip}>
            <StatIcon stat={quest.stat} size={12} />
            <Text style={[styles.chipText, { color: statColor, fontFamily: fonts.display }]}>{quest.stat}</Text>
          </View>
          <Text style={[styles.when, { color: t['dim-flat'], fontFamily: fonts.body }]}>{questWhenLabel(quest)}</Text>
          {quest.streak > 0 ? (
            <View style={styles.chip}>
              <FireStreak size={12} />
              <Text style={[styles.chipText, { color: t['muted-flat'], fontFamily: fonts.mono }]}>{String(quest.streak)}</Text>
            </View>
          ) : null}
          {frozen ? (
            <View accessible accessibilityLabel="Streak frozen"><SnowflakeIcon size={13} color={t.ice} /></View>
          ) : null}
          {sync ? (
            <View testID="quest-sync-tag" style={styles.chip}>
              {syncState === 'failed' ? <AlertIcon size={12} color={syncColor} /> : <ClockIcon size={12} color={syncColor} />}
              <Text style={[styles.syncText, { color: syncColor, fontFamily: fonts.body }]}>{sync.text}</Text>
            </View>
          ) : null}
          {genre ? <Text style={[styles.genre, { color: t['muted-flat'], borderColor: t['glass-border'], fontFamily: fonts.body }]}>{genre}</Text> : null}
        </View>
      </Pressable>

      {xpToast != null ? (
        <Text pointerEvents="none" style={[styles.toast, { color: t['accent-text'], fontFamily: fonts.mono }]}>{`+${xpToast} XP`}</Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`More actions for ${quest.name}`}
        accessibilityState={{ disabled: pending, busy: pending }}
        disabled={pending}
        onPress={onActions}
        style={[styles.more, pending && styles.dimmed]}>
        <MoreIcon size={20} color={t['muted-flat']} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  control: { minWidth: 12, alignItems: 'center', justifyContent: 'center' },
  checkHit: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 28, height: 28, borderWidth: 1.5, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepButton: { minWidth: 40, minHeight: 48, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontSize: 20, lineHeight: 22 },
  progress: { minWidth: 36, textAlign: 'center', fontSize: 13 },
  info: { flex: 1, minHeight: 48, justifyContent: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 4 },
  name: { fontSize: 15, lineHeight: 20 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipText: { fontSize: 11, letterSpacing: 0.8 },
  when: { fontSize: 12 },
  syncText: { fontSize: 12 },
  genre: { fontSize: 11, borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1 },
  toast: { position: 'absolute', right: 52, top: 4, fontSize: 12 },
  more: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.5 },
});
