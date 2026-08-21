import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Divider } from '@/components/eiyu/divider';
import { GhostButton } from '@/components/eiyu/ghost-button';
import { GlassView } from '@/components/eiyu/glass-view';
import { CheckIcon, ChevronIcon, PlusIcon, StatIcon } from '@/components/eiyu/icons';
import { PageBackground } from '@/components/eiyu/page-background';
import { STAT_COLORS } from '@/constants/eiyu-data';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';

export default function LongQuestsScreen() {
  const { user, theme, toggleStage, longQuestsLoading, longQuestsError, removeLongQuest } = useEiyu();
  const [expanded, setExpanded] = useState<string | null>(null);

  const confirmDelete = (id: string, name: string) => {
    Alert.alert('Delete Long Quest', `"${name}" and its stages will be removed permanently.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeLongQuest(id) },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.body }}>
      <PageBackground />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerBlock}>
          <Text style={[styles.title, { color: theme.text, fontFamily: fonts.display }]}>Long Quests</Text>
          <Text style={[styles.subtitle, { color: theme.muted, fontFamily: fonts.body }]}>
            Multi-stage goals — complete every milestone to finish
          </Text>
        </View>

        {longQuestsError ? (
          <Text style={[styles.emptyText, { color: '#f87171' }]}>
            Couldn&apos;t load Long Quests: {longQuestsError}
          </Text>
        ) : longQuestsLoading ? (
          <Text style={[styles.emptyText, { color: theme.muted }]}>Loading…</Text>
        ) : user.longQuests.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.muted }]}>
            No Long Quests yet. Start one below for a bigger, multi-stage goal.
          </Text>
        ) : (
          <View style={{ gap: 12 }}>
            {user.longQuests.map(lq => {
              const done = lq.stages.filter(s => s.done).length;
              const total = lq.stages.length;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const isExpanded = expanded === lq.id;
              const color = STAT_COLORS[lq.stat];

              return (
                <GlassView key={lq.id} style={{ overflow: 'hidden' }}>
                  <Pressable style={styles.cardHeader} onPress={() => setExpanded(isExpanded ? null : lq.id)}>
                    <View style={styles.cardTopRow}>
                      <View style={styles.cardTitleRow}>
                        <StatIcon stat={lq.stat} size={16} />
                        <Text
                          numberOfLines={1}
                          style={[styles.cardTitle, { color: theme.text, fontFamily: fonts.display }]}>
                          {lq.name}
                        </Text>
                      </View>
                      <View style={styles.cardMetaRow}>
                        <Text style={[styles.mono, { color }]}>
                          {done}/{total}
                        </Text>
                        <ChevronIcon direction={isExpanded ? 'down' : 'right'} size={15} color={theme.muted} />
                      </View>
                    </View>

                    <View style={[styles.track, { backgroundColor: theme.track }]}>
                      <View style={[styles.trackFill, { width: `${pct}%`, backgroundColor: color }]} />
                    </View>

                    <View style={styles.dotsRow}>
                      {lq.stages.map(stage => (
                        <View
                          key={stage.id}
                          style={[
                            styles.stageDot,
                            {
                              backgroundColor: stage.done ? color : theme.accentGlass,
                              borderColor: stage.done ? color : theme.accentBorder,
                            },
                          ]}
                        />
                      ))}
                    </View>
                  </Pressable>

                  {isExpanded && (
                    <View style={[styles.expandedBody, { borderTopColor: theme.glassBorder }]}>
                      {lq.stages.map((stage, i) => (
                        <View key={stage.id}>
                          {i > 0 && <Divider />}
                          <Pressable style={styles.stageRow} onPress={() => toggleStage(lq.id, stage.id)}>
                            <View
                              style={[
                                styles.stageCheckbox,
                                {
                                  borderColor: stage.done ? `${color}99` : theme.accentBorder,
                                  backgroundColor: stage.done ? `${color}18` : 'transparent',
                                },
                              ]}>
                              {stage.done && <CheckIcon size={12} color={color} />}
                            </View>
                            <Text
                              style={[
                                styles.stageName,
                                {
                                  color: stage.done ? theme.muted : theme.text,
                                  textDecorationLine: stage.done ? 'line-through' : 'none',
                                  fontFamily: fonts.body,
                                },
                              ]}>
                              {stage.name}
                            </Text>
                            {i === done && !stage.done && (
                              <View
                                style={[
                                  styles.nextBadge,
                                  { backgroundColor: `${color}15`, borderColor: `${color}30` },
                                ]}>
                                <Text style={[styles.nextBadgeText, { color, fontFamily: fonts.display }]}>
                                  NEXT
                                </Text>
                              </View>
                            )}
                          </Pressable>
                        </View>
                      ))}
                      <Divider style={{ marginTop: 4, marginBottom: 4 }} />
                      <Pressable style={styles.deleteRow} onPress={() => confirmDelete(lq.id, lq.name)}>
                        <Text style={styles.deleteRowText}>Delete Long Quest</Text>
                      </Pressable>
                    </View>
                  )}
                </GlassView>
              );
            })}
          </View>
        )}

        <GhostButton
          label="ADD A LONG QUEST"
          icon={<PlusIcon size={18} color={theme.accent} />}
          onPress={() => router.push('/long-quest-editor')}
          style={{ paddingVertical: 16, marginTop: 16 }}
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
  },
  headerBlock: {
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
  cardHeader: {
    padding: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: 17,
    flexShrink: 1,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  mono: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 12,
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
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  stageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
  },
  expandedBody: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 8,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  stageCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageName: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  nextBadge: {
    marginLeft: 'auto',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 1,
    paddingHorizontal: 6,
  },
  nextBadgeText: {
    fontSize: 10,
    letterSpacing: 1,
  },
  deleteRow: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  deleteRowText: {
    fontSize: 12,
    color: '#f87171',
  },
});
