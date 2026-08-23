import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Divider } from '@/components/eiyu/divider';
import { GlassView } from '@/components/eiyu/glass-view';
import { StatIcon } from '@/components/eiyu/icons';
import { PageBackground } from '@/components/eiyu/page-background';
import { RadarChart } from '@/components/eiyu/radar-chart';
import { Screen } from '@/components/eiyu/screen';
import { RANK_CONFIG, STATS, STAT_COLORS } from '@/constants/eiyu-data';
import { fonts } from '@/constants/eiyu-theme';
import { useAuth } from '@/contexts/auth-store';
import { useEiyu } from '@/contexts/eiyu-store';
import { formatError } from '@/lib/format-error';
import { fetchWeeklyReview, weeklyDayTotal, weeklyStatTotal, WeeklyDayDatum } from '@/lib/weekly-review';
import { fetchOrCreateWeeklySummary } from '@/lib/weekly-summary';
import { Stat } from '@/types/eiyu';

type StatusTab = 'stats' | 'weekly';

export default function StatusScreen() {
  const { user, theme, darkMode, weeklyQuest } = useEiyu();
  const { session } = useAuth();
  const [tab, setTab] = useState<StatusTab>('stats');
  const [weeklyData, setWeeklyData] = useState<WeeklyDayDatum[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<string | null>(null);
  const [weeklySummaryLoading, setWeeklySummaryLoading] = useState(false);
  const [weeklySummaryError, setWeeklySummaryError] = useState<string | null>(null);
  const cfg = RANK_CONFIG[user.rank];

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || tab !== 'weekly') return;
    let cancelled = false;
    setWeeklyLoading(true);
    setWeeklyError(null);
    fetchWeeklyReview(userId)
      .then(data => {
        if (!cancelled) setWeeklyData(data);
      })
      .catch(err => {
        if (!cancelled) setWeeklyError(formatError(err));
      })
      .finally(() => {
        if (!cancelled) setWeeklyLoading(false);
      });

    // R-60: skip if already loaded once this session — it's cached
    // server-side per week anyway, no need to re-fetch on every tab switch.
    if (weeklySummary === null && !weeklySummaryLoading) {
      setWeeklySummaryLoading(true);
      setWeeklySummaryError(null);
      fetchOrCreateWeeklySummary(userId)
        .then(text => {
          if (!cancelled) setWeeklySummary(text);
        })
        .catch(err => {
          if (!cancelled) setWeeklySummaryError(formatError(err));
        })
        .finally(() => {
          if (!cancelled) setWeeklySummaryLoading(false);
        });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id, tab]);

  const radarValues = STATS.reduce((acc, stat) => {
    acc[stat] = user.stats[stat].level;
    return acc;
  }, {} as Record<Stat, number>);

  const radarAccent = darkMode ? '#67e8f9' : '#0891b2';
  const radarFill = darkMode ? 'rgba(103,232,249,0.12)' : 'rgba(8,145,178,0.1)';
  const gridStroke = darkMode ? 'rgba(103,232,249,0.1)' : 'rgba(8,145,178,0.15)';

  return (
    <View style={{ flex: 1, backgroundColor: theme.body }}>
      <PageBackground />
      <Screen contentContainerStyle={styles.scroll} topGap={24}>
        <View style={styles.rankWrap}>
          <Text style={[styles.rankLabel, { color: theme.muted, fontFamily: fonts.display }]}>
            CURRENT RANK
          </Text>
          <View
            style={[
              styles.rankCircle,
              { backgroundColor: cfg.bg, borderColor: cfg.color, shadowColor: cfg.glow },
            ]}>
            <Text style={[styles.rankValue, { color: cfg.color, fontFamily: fonts.display }]}>
              {user.rank}
            </Text>
          </View>
          <Text style={[styles.rankSub, { color: theme.muted, fontFamily: fonts.body }]}>
            {user.name} · {user.userClass}
          </Text>
        </View>

        {weeklyQuest && (
          <GlassView style={styles.weeklyQuestCard}>
            <View style={styles.weeklyQuestHeader}>
              <View style={styles.weeklyQuestHeaderLeft}>
                <StatIcon stat={weeklyQuest.stat} size={15} />
                <Text style={[styles.weeklyQuestLabel, { color: theme.muted, fontFamily: fonts.display }]}>
                  WEEKLY QUEST
                </Text>
              </View>
              <Text style={[styles.mono, { color: STAT_COLORS[weeklyQuest.stat] }]}>
                {Math.min(weeklyQuest.currentCount, weeklyQuest.targetCount)}/{weeklyQuest.targetCount}
              </Text>
            </View>
            <Text style={[styles.weeklyQuestBody, { color: theme.text, fontFamily: fonts.body }]}>
              Complete {weeklyQuest.targetCount} {weeklyQuest.stat} quests this week
            </Text>
            <View style={[styles.track, { backgroundColor: theme.track }]}>
              <View
                style={[
                  styles.trackFill,
                  {
                    width: `${Math.min(100, (weeklyQuest.currentCount / weeklyQuest.targetCount) * 100)}%`,
                    backgroundColor: STAT_COLORS[weeklyQuest.stat],
                  },
                ]}
              />
            </View>
          </GlassView>
        )}

        <GlassView small style={styles.tabToggle}>
          <View style={styles.tabRow}>
            {(['stats', 'weekly'] as const).map(t => {
              const active = tab === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setTab(t)}
                  style={[
                    styles.tabButton,
                    {
                      backgroundColor: active ? theme.accentGlass : 'transparent',
                      borderColor: active ? theme.accentBorder : 'transparent',
                    },
                  ]}>
                  <Text
                    style={[
                      styles.tabLabel,
                      { color: active ? theme.accent : theme.muted, fontFamily: fonts.displaySemi },
                    ]}>
                    {t === 'stats' ? 'STATS' : 'WEEKLY REVIEW'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </GlassView>

        {tab === 'stats' ? (
          <>
            <GlassView style={styles.radarCard}>
              <View style={styles.radarWrap}>
                <RadarChart
                  values={radarValues}
                  maxValue={50}
                  size={230}
                  accent={radarAccent}
                  fill={radarFill}
                  gridStroke={gridStroke}
                />
              </View>
            </GlassView>

            <GlassView style={styles.statList}>
              {STATS.map((stat, i) => {
                const data = user.stats[stat];
                const pct = Math.round((data.xp / data.xpMax) * 100);
                return (
                  <View key={stat}>
                    {i > 0 && <Divider />}
                    <View style={styles.statRow}>
                      <StatIcon stat={stat} size={16} />
                      <View style={{ flex: 1 }}>
                        <View style={styles.statRowHeader}>
                          <Text style={[styles.statRowLabel, { color: STAT_COLORS[stat], fontFamily: fonts.display }]}>
                            {stat}
                          </Text>
                          <Text style={[styles.mono, { color: theme.muted }]}>
                            {data.xp} / {data.xpMax} XP
                          </Text>
                        </View>
                        <View style={[styles.track, { backgroundColor: theme.track }]}>
                          <View
                            style={[
                              styles.trackFill,
                              { width: `${pct}%`, backgroundColor: STAT_COLORS[stat] },
                            ]}
                          />
                        </View>
                      </View>
                      <View
                        style={[
                          styles.levelPill,
                          { backgroundColor: `${STAT_COLORS[stat]}18`, borderColor: `${STAT_COLORS[stat]}35` },
                        ]}>
                        <Text style={[styles.mono, { color: STAT_COLORS[stat], fontSize: 13 }]}>
                          {data.level}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </GlassView>
          </>
        ) : (
          <>
            <GlassView style={styles.summaryCard}>
              <Text style={[styles.summaryTitle, { color: theme.muted, fontFamily: fonts.display }]}>
                ✨ WEEKLY SUMMARY
              </Text>
              {weeklySummaryError ? (
                <Text style={[styles.weeklyEmptyText, { color: '#f87171' }]}>
                  Couldn&apos;t load summary: {weeklySummaryError}
                </Text>
              ) : weeklySummaryLoading || weeklySummary === null ? (
                <Text style={[styles.summaryBody, { color: theme.muted, fontFamily: fonts.body }]}>
                  Thinking…
                </Text>
              ) : (
                <Text style={[styles.summaryBody, { color: theme.text, fontFamily: fonts.body }]}>
                  {weeklySummary}
                </Text>
              )}
            </GlassView>

            <GlassView style={styles.weeklyCard}>
              <Text style={[styles.weeklyTitle, { color: theme.text, fontFamily: fonts.display }]}>
                LAST 7 DAYS
              </Text>
            {weeklyError ? (
              <Text style={[styles.weeklyEmptyText, { color: '#f87171' }]}>
                Couldn&apos;t load weekly review: {weeklyError}
              </Text>
            ) : weeklyLoading ? (
              <Text style={[styles.weeklyEmptyText, { color: theme.muted }]}>Loading…</Text>
            ) : (
              <>
                {weeklyData.map((day, i) => {
                  const dayTotal = weeklyDayTotal(day);
                  const maxTotal = Math.max(1, ...weeklyData.map(weeklyDayTotal));
                  return (
                    <View key={`${day.day}-${i}`}>
                      {i > 0 && <Divider />}
                      <View style={styles.weeklyRow}>
                        <Text style={[styles.weeklyDay, { color: theme.muted, fontFamily: fonts.displaySemi }]}>
                          {day.day}
                        </Text>
                        <View style={[styles.weeklyTrack, { backgroundColor: theme.track }]}>
                          <View
                            style={[
                              styles.weeklyTrackFill,
                              { width: `${(dayTotal / maxTotal) * 100}%`, backgroundColor: theme.accent },
                            ]}
                          />
                        </View>
                        <View style={styles.weeklyDots}>
                          {STATS.map(stat => (
                            <View
                              key={stat}
                              style={[
                                styles.weeklyDot,
                                { backgroundColor: day[stat] > 0 ? STAT_COLORS[stat] : theme.accentGlass },
                              ]}
                            />
                          ))}
                        </View>
                        <Text
                          style={[
                            styles.mono,
                            { color: dayTotal > 5 ? theme.accent : theme.muted, minWidth: 24, textAlign: 'right' },
                          ]}>
                          {dayTotal}
                        </Text>
                      </View>
                    </View>
                  );
                })}
                <Divider style={{ marginTop: 8, marginBottom: 12 }} />
                <View style={styles.weeklyTotals}>
                  {STATS.map(stat => {
                    const total = weeklyStatTotal(weeklyData, stat);
                    return (
                      <View key={stat} style={styles.weeklyTotalCell}>
                        <StatIcon stat={stat} size={14} />
                        <Text style={[styles.mono, { color: STAT_COLORS[stat], fontSize: 15 }]}>{total}</Text>
                        <Text style={[styles.weeklyTotalLabel, { color: theme.dim, fontFamily: fonts.body }]}>
                          {stat}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </GlassView>
          </>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    gap: 16,
  },
  rankWrap: {
    alignItems: 'center',
  },
  rankLabel: {
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 8,
  },
  rankCircle: {
    width: 72,
    height: 72,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 6,
  },
  rankValue: {
    fontSize: 38,
  },
  rankSub: {
    fontSize: 13,
    marginTop: 10,
  },
  weeklyQuestCard: {
    padding: 16,
    gap: 8,
  },
  weeklyQuestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weeklyQuestHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weeklyQuestLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
  },
  weeklyQuestBody: {
    fontSize: 13,
  },
  tabToggle: {
    padding: 4,
  },
  tabRow: {
    flexDirection: 'row',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 14,
    letterSpacing: 1,
  },
  radarCard: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  radarWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statList: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  statRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  statRowLabel: {
    fontSize: 14,
    letterSpacing: 1,
  },
  mono: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 11,
  },
  track: {
    borderRadius: 4,
    height: 5,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 4,
  },
  levelPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    minWidth: 40,
    alignItems: 'center',
  },
  summaryCard: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  summaryTitle: {
    fontSize: 11,
    letterSpacing: 1.5,
  },
  summaryBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  weeklyCard: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  weeklyTitle: {
    fontSize: 16,
    letterSpacing: 1,
    marginBottom: 16,
  },
  weeklyEmptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
  weeklyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  weeklyDay: {
    fontSize: 13,
    width: 32,
  },
  weeklyTrack: {
    flex: 1,
    borderRadius: 4,
    height: 6,
    overflow: 'hidden',
  },
  weeklyTrackFill: {
    height: '100%',
    borderRadius: 4,
  },
  weeklyDots: {
    flexDirection: 'row',
    gap: 4,
  },
  weeklyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  weeklyTotals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weeklyTotalCell: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  weeklyTotalLabel: {
    fontSize: 9,
    letterSpacing: 1,
  },
});
