import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Divider } from '@/components/eiyu/divider';
import { GhostButton } from '@/components/eiyu/ghost-button';
import { GlassView } from '@/components/eiyu/glass-view';
import { CheckIcon, ChevronIcon, PlusIcon, StatIcon } from '@/components/eiyu/icons';
import { PageBackground } from '@/components/eiyu/page-background';
import { Screen } from '@/components/eiyu/screen';
import { STAT_COLORS } from '@eiyu/shared';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';

export default function LongQuestsScreen() {
  const { user, theme, toggleStage, longQuestsLoading, longQuestsError, retryLongQuests, removeLongQuest } =
    useEiyu();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const confirmDelete = (id: string, name: string) => {
    setPendingDelete({ id, name });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.body }}>
      <PageBackground />
      <Screen contentContainerStyle={styles.scroll} topGap={24}>
        <View style={styles.headerBlock}>
          <Text style={[styles.title, { color: theme.text, fontFamily: fonts.display }]}>Long Quests</Text>
          <Text style={[styles.subtitle, { color: theme.muted, fontFamily: fonts.body }]}>
            Multi-stage goals — complete every milestone to finish
          </Text>
        </View>

        {longQuestsError ? (
          <View style={styles.errorBlock}>
            <Text style={[styles.emptyText, { color: '#f87171' }]}>
              Couldn&apos;t load Long Quests: {longQuestsError}
            </Text>
            <Pressable onPress={retryLongQuests} style={[styles.retryButton, { borderColor: theme.accentBorder }]}>
              <Text style={[styles.retryButtonText, { color: theme.accent, fontFamily: fonts.display }]}>
                RETRY
              </Text>
            </Pressable>
          </View>
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
                          <Pressable
                            testID="stage-checkbox"
                            style={styles.stageRow}
                            onPress={() => toggleStage(lq.id, stage.id)}>
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
      </Screen>

      <Modal visible={!!pendingDelete} transparent animationType="fade" onRequestClose={() => setPendingDelete(null)}>
        <View style={[styles.confirmOverlay, { backgroundColor: theme.overlay }]}>
          <GlassView style={styles.confirmCard}>
            <Text style={[styles.confirmTitle, { color: theme.text, fontFamily: fonts.display }]}>
              DELETE LONG QUEST
            </Text>
            <Text style={[styles.confirmBody, { color: theme.muted, fontFamily: fonts.body }]}>
              &quot;{pendingDelete?.name}&quot; and its stages will be removed permanently.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={[styles.confirmCancel, { borderColor: theme.glassBorder }]}
                onPress={() => setPendingDelete(null)}>
                <Text style={[styles.confirmCancelText, { color: theme.text, fontFamily: fonts.display }]}>
                  CANCEL
                </Text>
              </Pressable>
              <Pressable
                style={styles.confirmDelete}
                onPress={() => {
                  if (pendingDelete) removeLongQuest(pendingDelete.id);
                  setPendingDelete(null);
                }}>
                <Text style={[styles.confirmDeleteText, { fontFamily: fonts.display }]}>DELETE</Text>
              </Pressable>
            </View>
          </GlassView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
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
  confirmOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  confirmCard: {
    width: '100%',
    padding: 20,
    gap: 8,
  },
  confirmTitle: {
    fontSize: 16,
    letterSpacing: 1,
  },
  confirmBody: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmCancel: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmCancelText: {
    fontSize: 13,
    letterSpacing: 0.5,
  },
  confirmDelete: {
    flex: 1,
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmDeleteText: {
    fontSize: 13,
    letterSpacing: 0.5,
    color: '#f87171',
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
