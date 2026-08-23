import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';

import { CheckIcon, PlusIcon, SnowflakeIcon, StatIcon } from '@/components/eiyu/icons';
import { Divider } from '@/components/eiyu/divider';
import { GhostButton } from '@/components/eiyu/ghost-button';
import { GlassView } from '@/components/eiyu/glass-view';
import { PageBackground } from '@/components/eiyu/page-background';
import { Screen } from '@/components/eiyu/screen';
import { RANK_CONFIG, STATS, STAT_COLORS } from '@/constants/eiyu-data';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import { EASY_XP, FULL_XP } from '@/lib/eiyu-logic';
import { Quest, Rank } from '@/types/eiyu';

function RankBadge({ rank }: { rank: Rank }) {
  const cfg = RANK_CONFIG[rank];
  return (
    <View
      style={[
        styles.rankBadge,
        { backgroundColor: cfg.bg, borderColor: cfg.color, shadowColor: cfg.glow },
      ]}>
      <Text style={[styles.rankText, { color: cfg.color, fontFamily: fonts.display }]}>{rank}</Text>
    </View>
  );
}

function QuestRow({
  quest,
  onToggle,
  onCompleteEasy,
  onEdit,
  xpToast,
}: {
  quest: Quest;
  onToggle: () => void;
  onCompleteEasy: () => void;
  onEdit: () => void;
  xpToast: number | null;
}) {
  const { theme } = useEiyu();
  const [noteOpen, setNoteOpen] = useState(false);
  const isCompleted = quest.completed;
  const isFrozen = quest.frozen && !isCompleted;
  const diffColor = quest.difficulty === 'Hard' ? '#f87171' : quest.difficulty === 'Medium' ? '#fbbf24' : '#4ade80';
  const diffBg = quest.difficulty === 'Hard' ? 'rgba(248,113,113,0.12)' : quest.difficulty === 'Medium' ? 'rgba(251,191,36,0.12)' : 'rgba(74,222,128,0.1)';
  const diffBorder = quest.difficulty === 'Hard' ? 'rgba(248,113,113,0.2)' : quest.difficulty === 'Medium' ? 'rgba(251,191,36,0.2)' : 'rgba(74,222,128,0.15)';

  return (
    <View style={{ opacity: isCompleted ? 0.55 : 1 }}>
      <View style={styles.questRow}>
        <View>
          <Pressable
            testID="quest-checkbox"
            onPress={onToggle}
            onLongPress={onCompleteEasy}
            style={[
              styles.checkbox,
              {
                borderColor: isCompleted
                  ? 'rgba(74,222,128,0.5)'
                  : isFrozen
                    ? 'rgba(96,165,250,0.4)'
                    : theme.accentBorder,
                backgroundColor: isCompleted ? 'rgba(74,222,128,0.15)' : 'transparent',
              },
            ]}>
            {isCompleted && <CheckIcon size={14} color="#4ade80" />}
          </Pressable>
          {xpToast !== null && (
            <Animated.View
              entering={FadeInUp.duration(200)}
              exiting={FadeOutUp.duration(500)}
              style={styles.xpToast}
              pointerEvents="none">
              <Text style={[styles.xpToastText, { fontFamily: fonts.mono }]}>+{xpToast} XP</Text>
            </Animated.View>
          )}
        </View>

        <Pressable style={styles.questInfo} onPress={onEdit}>
          <Text
            numberOfLines={1}
            style={[
              styles.questName,
              {
                color: isCompleted ? theme.muted : theme.text,
                textDecorationLine: isCompleted ? 'line-through' : 'none',
                fontFamily: fonts.body,
              },
            ]}>
            {quest.name}
          </Text>
          <View style={styles.questMetaRow}>
            {quest.questType === 'one_time' ? (
              <View style={styles.oneTimePill}>
                <Text style={styles.oneTimePillText}>TODAY</Text>
              </View>
            ) : (
              quest.streak > 0 && (
                <Text style={[styles.mono, { color: theme.muted }]}>🔥 {quest.streak}</Text>
              )
            )}
            <Text style={[styles.questTime, { color: theme.dim, fontFamily: fonts.body }]}>{quest.time}</Text>
          </View>
          {quest.description && (
            <Pressable
              onPress={() => setNoteOpen(o => !o)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={noteOpen ? 'Hide note' : 'Show note'}>
              <Text
                numberOfLines={noteOpen ? undefined : 1}
                style={[styles.questNote, { color: theme.muted, fontFamily: fonts.body }]}>
                📝 {quest.description}
              </Text>
            </Pressable>
          )}
        </Pressable>

        <View style={styles.questTags}>
          {isFrozen && <SnowflakeIcon size={13} />}
          <View style={styles.statTag}>
            <StatIcon stat={quest.stat} size={14} />
            <Text style={[styles.statTagText, { color: STAT_COLORS[quest.stat], fontFamily: fonts.body }]}>
              {quest.stat}
            </Text>
          </View>
          <View style={[styles.diffTag, { backgroundColor: diffBg, borderColor: diffBorder }]}>
            <Text style={[styles.diffTagText, { color: diffColor, fontFamily: fonts.display }]}>
              {quest.difficulty[0]}
            </Text>
          </View>
        </View>
      </View>
      <Divider />
    </View>
  );
}

export default function BoardScreen() {
  const { user, theme, toggleQuest, completeEasy, completeRecovery, questsLoading, questsError, retryQuests } =
    useEiyu();
  const [xpToast, setXpToast] = useState<{ id: string; xp: number } | null>(null);
  const [showTypeChooser, setShowTypeChooser] = useState(false);
  const frozenQuest = user.quests.find(q => q.frozen && !q.completed);
  const completed = user.quests.filter(q => q.completed).length;
  const total = user.quests.length;
  const initials = user.name.split(' ').map(n => n[0]).join('');

  const flashXp = (id: string, xp: number) => {
    setXpToast({ id, xp });
    setTimeout(() => setXpToast(current => (current?.id === id ? null : current)), 900);
  };

  const handleToggle = (quest: Quest) => {
    if (!quest.completed) flashXp(quest.id, FULL_XP);
    toggleQuest(quest.id);
  };

  const handleCompleteEasy = (quest: Quest) => {
    // One-time quests have no easy version — completeEasy no-ops in the store,
    // so the toast must not claim XP nothing received.
    if (!quest.completed && quest.easyVersion) flashXp(quest.id, EASY_XP);
    completeEasy(quest.id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.body }}>
      <PageBackground />
      <Screen contentContainerStyle={styles.scroll} topGap={24}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: theme.accentGlass, borderColor: theme.accentBorder },
              ]}>
              <Text style={[styles.avatarText, { color: theme.accent, fontFamily: fonts.display }]}>
                {initials}
              </Text>
            </View>
            <View>
              <Text style={[styles.userName, { color: theme.text, fontFamily: fonts.display }]}>
                {user.name}
              </Text>
              <Text style={[styles.userClass, { color: theme.muted, fontFamily: fonts.body }]}>
                {user.userClass}
              </Text>
            </View>
          </View>
          <RankBadge rank={user.rank} />
        </View>

        <GlassView style={styles.statBar}>
          <View style={styles.statGrid}>
            {STATS.map(stat => {
              const s = user.stats[stat];
              const pct = Math.min(100, Math.max(0, Math.round((s.xp / s.xpMax) * 100)));
              return (
                <View key={stat} style={styles.statCell}>
                  <StatIcon stat={stat} size={15} />
                  <Text style={[styles.statLabel, { color: theme.muted }]}>{stat}</Text>
                  <Text style={[styles.statLevel, { color: STAT_COLORS[stat], fontFamily: fonts.mono }]}>
                    {s.level}
                  </Text>
                  {/* #14 fix: a level digit alone takes ~5 completions to move,
                      which read as "my stat didn't increase". The bar gives
                      per-completion feedback right where quests are completed
                      (the Status tab already had the full version). */}
                  <View
                    style={[styles.xpTrack, { backgroundColor: theme.track }]}
                    accessible
                    accessibilityRole="progressbar"
                    accessibilityValue={{ now: pct, min: 0, max: 100 }}
                    accessibilityLabel={`${stat} XP progress: ${pct}% to level ${s.level + 1}`}>
                    <View style={[styles.xpFill, { backgroundColor: STAT_COLORS[stat], width: `${pct}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
        </GlassView>

        {frozenQuest && (
          <View
            style={[
              styles.recoveryBanner,
              { backgroundColor: 'rgba(59,130,246,0.1)', borderColor: 'rgba(96,165,250,0.3)' },
            ]}>
            <View style={styles.recoveryHeader}>
              <View style={styles.recoveryTitleRow}>
                <SnowflakeIcon size={15} />
                <Text style={[styles.recoveryTitle, { fontFamily: fonts.display }]}>
                  STREAK FROZEN — RECOVERY QUEST
                </Text>
              </View>
              <Text style={[styles.mono, { color: '#93c5fd' }]}>{frozenQuest.frozenHoursLeft}h left</Text>
            </View>
            <Text style={[styles.recoveryName, { color: theme.text, fontFamily: fonts.body }]}>
              {frozenQuest.name}
            </Text>
            <Text style={[styles.recoveryEasy, { color: theme.muted, fontFamily: fonts.body }]}>
              Easy version: {frozenQuest.easyVersion}
            </Text>
            <GhostButton
              label="Mark Recovery Complete"
              onPress={() => {
                flashXp(frozenQuest.id, EASY_XP);
                completeRecovery(frozenQuest.id);
              }}
            />
          </View>
        )}

        <View style={styles.questsHeader}>
          <View>
            <Text style={[styles.questsTitle, { color: theme.text, fontFamily: fonts.display }]}>
              Today&apos;s Quests
            </Text>
            <Text style={[styles.questsSub, { color: theme.muted, fontFamily: fonts.body }]}>
              {completed} of {total} completed
            </Text>
          </View>
          <View
            style={[styles.progressPill, { backgroundColor: theme.accentGlass, borderColor: theme.accentBorder }]}>
            <Text style={[styles.mono, { color: theme.accent }]}>
              {completed}/{total}
            </Text>
          </View>
        </View>

        <GlassView style={styles.questList}>
          <Divider />
          {questsError ? (
            <View style={styles.errorBlock}>
              <Text style={[styles.emptyText, { color: '#f87171' }]}>Couldn&apos;t load quests: {questsError}</Text>
              <Pressable onPress={retryQuests} style={[styles.retryButton, { borderColor: theme.accentBorder }]}>
                <Text style={[styles.retryButtonText, { color: theme.accent, fontFamily: fonts.display }]}>
                  RETRY
                </Text>
              </Pressable>
            </View>
          ) : questsLoading ? (
            <Text style={[styles.emptyText, { color: theme.muted }]}>Loading today&apos;s quests…</Text>
          ) : user.quests.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.muted }]}>
              No quests scheduled for today. Tap &quot;Add a Quest&quot; below to create one.
            </Text>
          ) : (
            user.quests.map(quest => (
              <QuestRow
                key={quest.id}
                quest={quest}
                onToggle={() => handleToggle(quest)}
                onCompleteEasy={() => handleCompleteEasy(quest)}
                onEdit={() => router.push({ pathname: '/quest-editor', params: { id: quest.id } })}
                xpToast={xpToast?.id === quest.id ? xpToast.xp : null}
              />
            ))
          )}
        </GlassView>

        <GhostButton
          label="ADD A QUEST"
          icon={<PlusIcon size={18} color={theme.accent} />}
          onPress={() => setShowTypeChooser(true)}
          style={{ paddingVertical: 16 }}
        />
      </Screen>

      {/* Improvement-pass #7: pick the quest kind up-front — a repeating habit
          (streaks) or a one-time todo for today only. */}
      <Modal
        visible={showTypeChooser}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTypeChooser(false)}>
        <Pressable style={styles.chooserOverlay} onPress={() => setShowTypeChooser(false)}>
          {/* No-op responder so tapping inside the card (title/subtitle area)
              doesn't fall through to the backdrop's dismiss handler. */}
          <Pressable
            style={[styles.chooserCard, { backgroundColor: theme.modal, borderColor: theme.glassBorder }]}
            onPress={() => {}}>
            <Text style={[styles.chooserTitle, { color: theme.text, fontFamily: fonts.display }]}>
              NEW QUEST
            </Text>
            <Text style={[styles.chooserSub, { color: theme.muted, fontFamily: fonts.body }]}>
              What kind of quest is this?
            </Text>
            <Pressable
              onPress={() => {
                setShowTypeChooser(false);
                router.push('/quest-editor');
              }}
              style={[styles.chooserOption, { borderColor: theme.accentBorder, backgroundColor: theme.accentGlass }]}>
              <Text style={[styles.chooserOptionTitle, { color: theme.accent, fontFamily: fonts.display }]}>
                HABIT QUEST
              </Text>
              <Text style={[styles.chooserOptionDesc, { color: theme.muted, fontFamily: fonts.body }]}>
                Repeats on chosen days — build streaks
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowTypeChooser(false);
                router.push({ pathname: '/quest-editor', params: { type: 'one_time' } });
              }}
              style={[styles.chooserOption, { borderColor: theme.glassBorder }]}>
              <Text style={[styles.chooserOptionTitle, { color: theme.text, fontFamily: fonts.display }]}>
                ONE-TIME QUEST
              </Text>
              <Text style={[styles.chooserOptionDesc, { color: theme.muted, fontFamily: fonts.body }]}>
                A todo for today only — done or gone, no streak
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  chooserOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  chooserCard: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  chooserTitle: {
    fontSize: 18,
    letterSpacing: 1.5,
  },
  chooserSub: {
    fontSize: 13,
    marginTop: -6,
  },
  chooserOption: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  chooserOptionTitle: {
    fontSize: 14,
    letterSpacing: 1,
  },
  chooserOptionDesc: {
    fontSize: 12,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 17,
  },
  userName: {
    fontSize: 18,
    lineHeight: 20,
  },
  userClass: {
    fontSize: 12,
    marginTop: 2,
  },
  rankBadge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 4,
  },
  rankText: {
    fontSize: 24,
    letterSpacing: 1,
  },
  statBar: {
    padding: 16,
  },
  statGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCell: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    letterSpacing: 1,
    fontFamily: 'Inter_500Medium',
  },
  statLevel: {
    fontSize: 16,
  },
  xpTrack: {
    height: 3,
    borderRadius: 1.5,
    width: '80%',
    alignSelf: 'center',
    overflow: 'hidden',
    marginTop: 2,
  },
  xpFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  oneTimePill: {
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderRadius: 6,
    paddingVertical: 1,
    paddingHorizontal: 6,
  },
  oneTimePillText: {
    fontSize: 9,
    letterSpacing: 0.8,
    color: '#fbbf24',
    fontFamily: fonts.displaySemi,
  },
  questNote: {
    fontSize: 12,
    marginTop: 3,
  },
  recoveryBanner: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  recoveryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recoveryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recoveryTitle: {
    fontSize: 13,
    color: '#93c5fd',
    letterSpacing: 1,
  },
  recoveryName: {
    fontSize: 14,
    fontWeight: '500',
  },
  recoveryEasy: {
    fontSize: 12,
    marginBottom: 4,
  },
  mono: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 12,
  },
  questsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  questsTitle: {
    fontSize: 20,
    letterSpacing: 0.5,
  },
  questsSub: {
    fontSize: 12,
    marginTop: 1,
  },
  progressPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  questList: {
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
  errorBlock: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  retryButtonText: {
    fontSize: 12,
    letterSpacing: 1,
  },
  questRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xpToast: {
    position: 'absolute',
    top: -18,
    left: -4,
    backgroundColor: 'rgba(74,222,128,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.4)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  xpToastText: {
    fontSize: 10,
    color: '#4ade80',
  },
  questInfo: {
    flex: 1,
    minWidth: 0,
  },
  questName: {
    fontSize: 14,
    fontWeight: '500',
  },
  questMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  questTime: {
    fontSize: 11,
  },
  questTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statTagText: {
    fontSize: 11,
    fontWeight: '500',
  },
  diffTag: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  diffTagText: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
});
