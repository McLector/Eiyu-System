import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CheckIcon, PlusIcon, SnowflakeIcon, StatIcon } from '@/components/eiyu/icons';
import { Divider } from '@/components/eiyu/divider';
import { GhostButton } from '@/components/eiyu/ghost-button';
import { GlassView } from '@/components/eiyu/glass-view';
import { PageBackground } from '@/components/eiyu/page-background';
import { RANK_CONFIG, STATS, STAT_COLORS } from '@/constants/eiyu-data';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
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

function QuestRow({ quest, onToggle, onEdit }: { quest: Quest; onToggle: () => void; onEdit: () => void }) {
  const { theme } = useEiyu();
  const isCompleted = quest.completed;
  const isFrozen = quest.frozen && !isCompleted;
  const diffColor = quest.difficulty === 'Hard' ? '#f87171' : quest.difficulty === 'Medium' ? '#fbbf24' : '#4ade80';
  const diffBg = quest.difficulty === 'Hard' ? 'rgba(248,113,113,0.12)' : quest.difficulty === 'Medium' ? 'rgba(251,191,36,0.12)' : 'rgba(74,222,128,0.1)';
  const diffBorder = quest.difficulty === 'Hard' ? 'rgba(248,113,113,0.2)' : quest.difficulty === 'Medium' ? 'rgba(251,191,36,0.2)' : 'rgba(74,222,128,0.15)';

  return (
    <View style={{ opacity: isCompleted ? 0.55 : 1 }}>
      <View style={styles.questRow}>
        <Pressable
          onPress={onToggle}
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
            {quest.streak > 0 && (
              <Text style={[styles.mono, { color: theme.muted }]}>🔥 {quest.streak}</Text>
            )}
            <Text style={[styles.questTime, { color: theme.dim, fontFamily: fonts.body }]}>{quest.time}</Text>
          </View>
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
  const { user, theme, toggleQuest } = useEiyu();
  const frozenQuest = user.quests.find(q => q.frozen && !q.completed);
  const completed = user.quests.filter(q => q.completed).length;
  const total = user.quests.length;
  const initials = user.name.split(' ').map(n => n[0]).join('');

  return (
    <View style={{ flex: 1, backgroundColor: theme.body }}>
      <PageBackground />
      <ScrollView contentContainerStyle={styles.scroll}>
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
            {STATS.map(stat => (
              <View key={stat} style={styles.statCell}>
                <StatIcon stat={stat} size={15} />
                <Text style={[styles.statLabel, { color: theme.muted }]}>{stat}</Text>
                <Text style={[styles.statLevel, { color: STAT_COLORS[stat], fontFamily: fonts.mono }]}>
                  {user.stats[stat].level}
                </Text>
              </View>
            ))}
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
            <GhostButton label="Mark Recovery Complete" onPress={() => {}} />
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
          {user.quests.map(quest => (
            <QuestRow
              key={quest.id}
              quest={quest}
              onToggle={() => toggleQuest(quest.id)}
              onEdit={() => router.push({ pathname: '/quest-editor', params: { id: quest.id } })}
            />
          ))}
        </GlassView>

        <GhostButton
          label="ADD A QUEST"
          icon={<PlusIcon size={18} color={theme.accent} />}
          onPress={() => router.push('/quest-editor')}
          style={{ paddingVertical: 16 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 24,
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
