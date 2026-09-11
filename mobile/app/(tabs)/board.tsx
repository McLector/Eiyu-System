import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInUp,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { CheckIcon, PlusIcon, SnowflakeIcon, StatIcon } from '@/components/eiyu/icons';
import { Divider } from '@/components/eiyu/divider';
import { GhostButton } from '@/components/eiyu/ghost-button';
import { GlassView } from '@/components/eiyu/glass-view';
import { PageBackground } from '@/components/eiyu/page-background';
import { Screen } from '@/components/eiyu/screen';
import { DAYS, formatDisplayDate, partitionBoardQuests, RANK_CONFIG, STATS, STAT_COLORS } from '@eiyu/shared';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import { hapticLight, hapticSuccess } from '@/lib/haptics';
import { EASY_XP, FULL_XP } from '@eiyu/shared';
import { Quest, Rank } from '@eiyu/shared';

/**
 * The per-stat XP bar, animated. It used to set `width: \`${pct}%\`` directly,
 * which made the one visual that represents "you gained XP" snap to its new
 * value between frames - the gain was over before the eye could register it.
 * Animating scaleX (not width) keeps the whole thing on the UI thread, so the
 * fill still glides while JS is busy committing the completion.
 */
function StatXpBar({ pct, color, track, stat, level }: {
  pct: number;
  color: string;
  track: string;
  stat: string;
  level: number;
}) {
  const progress = useSharedValue(pct / 100);

  useEffect(() => {
    progress.value = withTiming(pct / 100, {
      duration: 550,
      easing: Easing.out(Easing.cubic),
    });
  }, [pct, progress]);

  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }] }));

  return (
    <View
      style={[styles.xpTrack, { backgroundColor: track }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ now: pct, min: 0, max: 100 }}
      accessibilityLabel={`${stat} XP progress: ${pct}% to level ${level + 1}`}>
      <Animated.View style={[styles.xpFill, { backgroundColor: color }, fillStyle]} />
    </View>
  );
}

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

function recoveryDeadlineLabel(quest: Quest) {
  if (!quest.recoveryDeadline) return `${quest.frozenHoursLeft ?? 0}h left`;
  return `Until ${new Intl.DateTimeFormat(undefined, {
    timeZone: quest.recoveryTimeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(quest.recoveryDeadline))}`;
}

function QuestRow({
  quest,
  onToggle,
  onCompleteEasy,
  onEdit,
  onAdjustProgress,
  xpToast,
}: {
  quest: Quest;
  onToggle: () => void;
  onCompleteEasy: () => void;
  onEdit: () => void;
  onAdjustProgress: (delta: number) => void;
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
          {quest.targetCount == null ? (
            <Pressable
              testID="quest-checkbox"
              onPress={onToggle}
              onLongPress={onCompleteEasy}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isCompleted }}
              accessibilityLabel={`${quest.name}${isCompleted ? ' (completed)' : ''}`}
              accessibilityActions={[{ name: 'longpress', label: 'Complete penalty' }]}
              onAccessibilityAction={event => {
                if (event.nativeEvent.actionName === 'longpress') onCompleteEasy();
              }}
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
          ) : (
            <View
              style={styles.progressStepper}
              accessibilityRole="adjustable"
              accessibilityLabel={`${quest.name}, ${quest.progressCount} of ${quest.targetCount}`}>
              <Pressable
                onPress={() => onAdjustProgress(-1)}
                disabled={quest.progressCount <= 0}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Decrease progress"
                style={[
                  styles.stepperButton,
                  { opacity: quest.progressCount <= 0 ? 0.4 : 1, borderColor: theme.accentBorder },
                ]}>
                <Text style={[styles.stepperButtonText, { color: theme.text }]}>−</Text>
              </Pressable>
              <Text style={[styles.mono, { color: isCompleted ? '#4ade80' : theme.text, minWidth: 34, textAlign: 'center' }]}>
                {quest.progressCount}/{quest.targetCount}
              </Text>
              <Pressable
                onPress={() => onAdjustProgress(1)}
                disabled={quest.progressCount >= quest.targetCount}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Increase progress"
                style={[
                  styles.stepperButton,
                  { opacity: quest.progressCount >= quest.targetCount ? 0.4 : 1, borderColor: theme.accentBorder },
                ]}>
                <Text style={[styles.stepperButtonText, { color: theme.text }]}>+</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Pressable testID="quest-edit-trigger" style={styles.questInfo} onPress={onEdit}>
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

        {xpToast !== null && (
          <Animated.View
            entering={FadeInUp.duration(180)}
            exiting={FadeOutUp.duration(520)}
            style={styles.xpToast}
            pointerEvents="none">
            <Text style={[styles.xpToastText, { fontFamily: fonts.mono }]}>+{xpToast} XP</Text>
          </Animated.View>
        )}

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

function HabitCatalogRow({ quest, onEdit }: { quest: Quest; onEdit: () => void }) {
  const { theme } = useEiyu();
  const schedule = quest.days.length === 7 ? 'Every day' : quest.days.map(day => DAYS[day]).join(', ');

  return (
    <Pressable
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${quest.name}`}
      style={styles.catalogRow}>
      <View style={styles.questInfo}>
        <Text style={[styles.questName, { color: theme.text, fontFamily: fonts.body }]}>{quest.name}</Text>
        <Text style={[styles.catalogSchedule, { color: theme.muted, fontFamily: fonts.body }]}>
          {schedule || 'No scheduled days'}
        </Text>
      </View>
      <View
        style={[
          styles.catalogStatus,
          { backgroundColor: theme.accentGlass, borderColor: theme.accentBorder },
        ]}>
        <Text style={[styles.catalogStatusText, { color: quest.archived ? theme.muted : theme.accent }]}>
          {quest.archived ? 'ARCHIVED' : quest.dailyEligible ? 'TODAY' : 'OFF DAY'}
        </Text>
      </View>
    </Pressable>
  );
}

export default function BoardScreen() {
  const {
    user,
    theme,
    toggleQuest,
    completeEasy,
    adjustProgress,
    completeRecovery,
    questsLoading,
    questsError,
    retryQuests,
  } = useEiyu();
  const [xpToast, setXpToast] = useState<{ id: string; xp: number } | null>(null);
  const [showTypeChooser, setShowTypeChooser] = useState(false);
  const { dailyQuests, recoveryRequired, oneTimeQuests, allHabits } = partitionBoardQuests(user.quests);
  const activeHabits = allHabits.filter(quest => !quest.archived);
  const archivedHabits = allHabits.filter(quest => quest.archived);
  const completed = dailyQuests.filter(q => q.completed).length;
  const total = dailyQuests.length;
  const initials = user.name.split(' ').map(n => n[0]).join('');

  const flashXp = (id: string, xp: number) => {
    setXpToast({ id, xp });
    setTimeout(() => setXpToast(current => (current?.id === id ? null : current)), 900);
  };

  const handleToggle = (quest: Quest) => {
    if (!quest.completed) {
      // Milestone: completing gets the success cue; undo is a plain tap.
      hapticSuccess();
      flashXp(quest.id, FULL_XP);
    } else {
      hapticLight();
    }
    toggleQuest(quest.id);
  };

  const handleCompleteEasy = (quest: Quest) => {
    // One-time quests have no Penalty — the legacy completeEasy action no-ops in the store,
    // so the toast must not claim XP nothing received.
    if (!quest.completed && quest.easyVersion) {
      hapticLight();
      flashXp(quest.id, EASY_XP);
    }
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
              <Text style={[styles.dateText, { color: theme.dim, fontFamily: fonts.body }]}>
                {formatDisplayDate(new Date(), user.timeZone)}
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
                  <StatXpBar
                    pct={pct}
                    color={STAT_COLORS[stat]}
                    track={theme.track}
                    stat={stat}
                    level={s.level}
                  />
                </View>
              );
            })}
          </View>
        </GlassView>

        {recoveryRequired.length > 0 && (
          <View style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, { color: theme.text, fontFamily: fonts.display }]}>
              RECOVERY REQUIRED
            </Text>
            {recoveryRequired.map(fq => (
              <View
                key={fq.id}
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
                  <Text style={[styles.mono, { color: '#93c5fd' }]}>{recoveryDeadlineLabel(fq)}</Text>
                </View>
                <Text style={[styles.recoveryName, { color: theme.text, fontFamily: fonts.body }]}>
                  {fq.name}
                </Text>
                <Text style={[styles.recoveryEasy, { color: theme.muted, fontFamily: fonts.body }]}>
                  Penalty: {fq.easyVersion}
                </Text>
                <GhostButton
                  label="Mark Recovery Complete"
                  onPress={() => {
                    flashXp(fq.id, EASY_XP);
                    completeRecovery(fq.id);
                  }}
                />
              </View>
            ))}
          </View>
        )}

        <View style={styles.questsHeader}>
          <View>
            <Text style={[styles.questsTitle, { color: theme.text, fontFamily: fonts.display }]}>
              DAILY QUESTS
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
          ) : dailyQuests.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.muted }]}>
              No habits are scheduled for today. Your saved habits are still available under All Habits.
            </Text>
          ) : (
            dailyQuests.map(quest => (
              <QuestRow
                key={quest.id}
                quest={quest}
                onToggle={() => handleToggle(quest)}
                onCompleteEasy={() => handleCompleteEasy(quest)}
                onEdit={() => router.push({ pathname: '/quest-editor', params: { id: quest.id } })}
                onAdjustProgress={delta => adjustProgress(quest.id, delta)}
                xpToast={xpToast?.id === quest.id ? xpToast.xp : null}
              />
            ))
          )}
        </GlassView>

        {!questsLoading && !questsError && (
          <>
            <View style={styles.sectionGroup}>
              <Text style={[styles.sectionHeading, { color: theme.text, fontFamily: fonts.display }]}>
                ONE-TIME QUESTS
              </Text>
              <GlassView style={styles.questList}>
                {oneTimeQuests.length === 0 ? (
                  <Text style={[styles.emptyText, { color: theme.muted }]}>No one-time quests scheduled for today.</Text>
                ) : (
                  oneTimeQuests.map(quest => (
                    <QuestRow
                      key={quest.id}
                      quest={quest}
                      onToggle={() => handleToggle(quest)}
                      onCompleteEasy={() => handleCompleteEasy(quest)}
                      onEdit={() => router.push({ pathname: '/quest-editor', params: { id: quest.id } })}
                      onAdjustProgress={delta => adjustProgress(quest.id, delta)}
                      xpToast={xpToast?.id === quest.id ? xpToast.xp : null}
                    />
                  ))
                )}
              </GlassView>
            </View>

            <View style={styles.sectionGroup}>
              <Text style={[styles.sectionHeading, { color: theme.text, fontFamily: fonts.display }]}>ALL HABITS</Text>
              <GlassView style={styles.questList}>
                {allHabits.length === 0 ? (
                  <Text style={[styles.emptyText, { color: theme.muted }]}>No saved habits yet.</Text>
                ) : (
                  <>
                    {activeHabits.map(quest => (
                      <HabitCatalogRow
                        key={quest.id}
                        quest={quest}
                        onEdit={() => router.push({ pathname: '/quest-editor', params: { id: quest.id } })}
                      />
                    ))}
                    {archivedHabits.length > 0 && (
                      <>
                        <Text style={[styles.sectionLabel, { color: theme.muted, fontFamily: fonts.display }]}>ARCHIVED</Text>
                        {archivedHabits.map(quest => (
                          <HabitCatalogRow
                            key={quest.id}
                            quest={quest}
                            onEdit={() => router.push({ pathname: '/quest-editor', params: { id: quest.id } })}
                          />
                        ))}
                      </>
                    )}
                  </>
                )}
              </GlassView>
            </View>
          </>
        )}

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
  dateText: {
    fontSize: 11,
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
    width: '100%',
    borderRadius: 1.5,
    // scaleX drives progress, so the bar must grow from the left edge
    // rather than from its centre.
    transformOrigin: 'left',
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
    flexWrap: 'wrap',
    gap: 6,
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  sectionGroup: {
    gap: 8,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  catalogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.2)',
  },
  catalogSchedule: {
    fontSize: 11,
    marginTop: 3,
  },
  catalogStatus: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  catalogStatusText: {
    fontFamily: fonts.displaySemi,
    fontSize: 9,
    letterSpacing: 0.7,
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
  progressStepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperButton: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { fontSize: 16, fontWeight: '600', lineHeight: 18 },
  /**
   * Anchored to the quest ROW, bottom-left, so it always sits INSIDE the
   * row's bounds - the quest list's GlassView clips (overflow: 'hidden'),
   * and the previous negative offset put this entirely outside its parent.
   * `bottom` + FadeOutUp means it rises off its resting spot as it leaves.
   */
  xpToast: {
    position: 'absolute',
    left: 34,
    bottom: 4,
    backgroundColor: 'rgba(74,222,128,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.55)',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  xpToastText: {
    fontSize: 13,
    letterSpacing: 0.5,
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
