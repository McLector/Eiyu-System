import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import {
  accountDateKey,
  boardTodayProgress,
  EASY_XP,
  formatError,
  FULL_XP,
  hasManualOrder,
  moveId,
  partitionBoardQuests,
  reorderState,
  type Quest,
  type QuestType,
} from '@eiyu/shared';

import { AddQuestSheet, type QuestTypeChoice } from '@/components/board/add-quest-sheet';
import { AllHabitsSheet } from '@/components/board/all-habits-sheet';
import { DeleteQuestModal } from '@/components/board/delete-quest-modal';
import { ProfileStrip } from '@/components/board/profile-strip';
import { questActions, type QuestActionKey } from '@/components/board/quest-actions';
import { QuestDetailsSheet } from '@/components/board/quest-details-sheet';
import { QuestRow } from '@/components/board/quest-row';
import { RecoverySheet } from '@/components/board/recovery-sheet';
import { SyncNotice } from '@/components/board/sync-notice';
import { SyncReviewSheet } from '@/components/board/sync-review-sheet';
import { ListIcon, PlusIcon, SnowflakeIcon } from '@/components/eiyu/icons';
import { ActionSheet } from '@/components/ui/action-sheet';
import { Button } from '@/components/ui/button';
import { ReorderableList } from '@/components/ui/reorderable-list';
import { StateBlock } from '@/components/ui/state-block';
import { UndoBar } from '@/components/ui/undo-bar';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import { useTokens } from '@/contexts/theme-store';
import { consumeBoardReturnIntent } from '@/lib/board-return-intent';
import { hapticLight, hapticSuccess } from '@/lib/haptics';

type LaneId = 'daily' | 'one-time' | 'backlog';
const LANES: { id: LaneId; label: string }[] = [
  { id: 'daily', label: 'DAILY QUEST' },
  { id: 'one-time', label: '1-TIME QUEST' },
  { id: 'backlog', label: 'BACKLOG' },
];
/** The kinds the add sheet offers. */
const OFFERED_TYPES: QuestTypeChoice[] = ['habit', 'one_time', 'backlog'];
/** The tab bar floats over the content at normal font size; this keeps the footer clear of it. */

interface ArchiveNotice { id: number; questId: string; kind: 'Habit' | 'Quest' }

export default function BoardScreen() {
  const t = useTokens();
  const {
    user,
    backlog,
    toggleQuest,
    adjustProgress,
    completeRecovery,
    questsLoading,
    questsError,
    questsHaveCachedData,
    retryQuests,
    reminderWarning,
    retryReminders,
    syncStates,
    syncWaiting,
    syncOffline,
    failedSyncs,
    retrySync,
    dismissSync,
    archiveQuest,
    restoreQuest,
    deleteQuest,
    moveToOneTime,
    moveToBacklog,
    reorderQuests,
  } = useEiyu();

  const [activeLane, setActiveLane] = useState<LaneId>('daily');
  const pagerRef = useRef<PagerView>(null);
  const [xpToast, setXpToast] = useState<{ id: string; xp: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<Quest | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Quest | null>(null);
  const [allHabitsOpen, setAllHabitsOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [notice, setNotice] = useState<ArchiveNotice | null>(null);
  const noticeSeq = useRef(0);
  const [deleteTarget, setDeleteTarget] = useState<Quest | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteInFlight = useRef(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  // A grip is held: the lane and the pager must not take the touch away.
  const [dragging, setDragging] = useState(false);
  const inFlight = useRef(new Set<string>());

  useFocusEffect(useCallback(() => {
    const returnLane = consumeBoardReturnIntent();
    if (returnLane) setActiveLane(returnLane);
  }, []));

  // A tapped reminder asks for its lane through a route param; it is cleared once applied so it is not replayed.
  const { lane: requestedLane } = useLocalSearchParams<{ lane?: string }>();
  useEffect(() => {
    const lane = LANES.find(item => item.id === requestedLane);
    if (!lane) return;
    setActiveLane(lane.id);
    router.setParams({ lane: undefined });
  }, [requestedLane]);

  // The tab and a swipe both end up here: keep the pager on the selected lane.
  useEffect(() => {
    pagerRef.current?.setPage?.(LANES.findIndex(lane => lane.id === activeLane));
  }, [activeLane]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const accountToday = accountDateKey(new Date(), user.timeZone);
  const { dailyQuests, recoveryRequired, oneTimeQuests, allHabits } = partitionBoardQuests(user.quests, accountToday);
  const { completed, total } = boardTodayProgress({ dailyQuests, oneTimeQuests }, accountToday);
  const counts: Record<LaneId, number> = { daily: dailyQuests.length, 'one-time': oneTimeQuests.length, backlog: backlog.length };

  const flashXp = (id: string, xp: number) => {
    setXpToast({ id, xp });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setXpToast(current => (current?.id === id ? null : current)), 900);
  };

  /** One action at a time per quest: a second one is ignored until the first settles. Failures reach the Retry banner via the store. */
  const queueLifecycle = (id: string, action: () => Promise<void>) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setPendingIds(new Set(inFlight.current));
    void action().catch(() => {}).finally(() => {
      inFlight.current.delete(id);
      setPendingIds(new Set(inFlight.current));
    });
  };

  const archive = (quest: Quest) => queueLifecycle(quest.id, async () => {
    await archiveQuest(quest.id);
    hapticLight();
    noticeSeq.current += 1;
    setNotice({ id: noticeSeq.current, questId: quest.id, kind: quest.questType === 'habit' ? 'Habit' : 'Quest' });
  });

  const move = (quest: Quest, direction: 'to-one-time' | 'to-backlog') => queueLifecycle(quest.id, async () => {
    await (direction === 'to-one-time' ? moveToOneTime(quest.id) : moveToBacklog(quest.id));
    hapticLight();
  });

  // The unfinished quests of each lane that carries a manual order, in order: exactly what the server is sent, so a
  // finished quest (listed last) never counts as a place to move to.
  const laneQuests: Record<QuestType, Quest[]> = { habit: dailyQuests, one_time: oneTimeQuests, backlog };
  const movable: Partial<Record<QuestType, string[]>> = {};
  for (const type of ['habit', 'one_time', 'backlog'] as const) {
    if (hasManualOrder(laneQuests[type])) movable[type] = laneQuests[type].filter(q => !q.completed).map(q => q.id);
  }
  const orderFor = (quest: Quest) => {
    const ids = movable[quest.questType];
    return ids && !quest.completed ? reorderState(ids, quest.id) : null;
  };
  const saveOrder = (type: QuestType, ids: string[]) => {
    hapticLight();
    void reorderQuests(type, ids).catch(() => {});
  };

  const openEditor = (quest: Quest) => router.push({ pathname: '/quest-editor', params: { id: quest.id } });

  const runAction = (key: QuestActionKey, quest: Quest) => {
    if (key === 'details') setDetailsTarget(quest);
    else if (key === 'edit') openEditor(quest);
    else if (key === 'move-top' || key === 'move-up' || key === 'move-down') {
      const ids = movable[quest.questType];
      if (!ids) return;
      const to = key === 'move-top' ? 'top' : key === 'move-up' ? 'up' : 'down';
      queueLifecycle(quest.id, async () => {
        await reorderQuests(quest.questType, moveId(ids, quest.id, to));
        hapticLight();
      });
    }
    else if (key === 'move-to-one-time') move(quest, 'to-one-time');
    else if (key === 'move-to-backlog') move(quest, 'to-backlog');
    else if (key === 'archive') archive(quest);
    else { setDeleteError(null); setDeleteTarget(quest); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteInFlight.current) return;
    deleteInFlight.current = true;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await deleteQuest(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(formatError(err));
    } finally {
      deleteInFlight.current = false;
      setDeletePending(false);
    }
  };

  const handleToggle = (quest: Quest) => {
    if (!quest.completed && !syncOffline) {
      // Milestone: completing gets the success cue; undo is a plain tap. Offline, the server has not confirmed the
      // reward yet, so the change is shown quietly and the cue is left to the confirmed write.
      hapticSuccess();
      flashXp(quest.id, FULL_XP);
    } else {
      hapticLight();
    }
    toggleQuest(quest.id);
  };

  const choose = (type: QuestTypeChoice) => {
    setAddOpen(false);
    if (type === 'habit') router.push('/quest-editor');
    else router.push({ pathname: '/quest-editor', params: { type, returnLane: type === 'one_time' ? 'one-time' : type } });
  };

  const row = (quest: Quest, grip?: ReactNode) => (
    <QuestRow
      key={quest.id}
      grip={grip}
      quest={quest}
      today={accountToday}
      pending={pendingIds.has(quest.id)}
      xpToast={xpToast?.id === quest.id ? xpToast.xp : null}
      syncState={syncStates.get(quest.id)}
      onToggle={() => handleToggle(quest)}
      onOpen={() => setDetailsTarget(quest)}
      onAdjustProgress={delta => adjustProgress(quest.id, delta)}
      onActions={() => setActionTarget(quest)}
    />
  );

  const empty = (text: string) => <Text style={[styles.empty, { color: t['muted-flat'], fontFamily: fonts.body }]}>{text}</Text>;

  // A lane with a manual order lists its unfinished quests with grips, then the finished ones below.
  const laneRows = (type: QuestType, quests: Quest[]): ReactNode => {
    const ids = movable[type];
    if (!ids) return quests.map(quest => row(quest));
    const byId = new Map(quests.map(quest => [quest.id, quest] as const));
    return [
      <ReorderableList
        key={`order-${type}`}
        items={ids.map(id => ({ id, name: byId.get(id)?.name ?? '' }))}
        onReorder={next => saveOrder(type, next)}
        onDragChange={setDragging}
        renderRow={(id, grip) => row(byId.get(id)!, grip)}
      />,
      ...quests.filter(quest => quest.completed).map(quest => row(quest)),
    ];
  };

  const lists: Record<LaneId, ReactNode> = {
    daily: dailyQuests.length === 0 ? empty('No habits are scheduled for today. Create one or check All Habits.') : laneRows('habit', dailyQuests),
    'one-time': oneTimeQuests.length === 0 ? empty('No 1-time quests scheduled for today.') : laneRows('one_time', oneTimeQuests),
    backlog: backlog.length === 0 ? empty('Nothing in the Backlog. Capture an idea with ADD A QUEST.') : laneRows('backlog', backlog),
  };

  const firstLoadFailed = !!questsError && !questsHaveCachedData;
  const firstLoadRunning = questsLoading && !questsHaveCachedData;

  return (
    <View style={[styles.root, { backgroundColor: t['page-flat'] }]}>
      <View style={styles.top}>
        {reminderWarning ? (
          <View style={[styles.notice, { backgroundColor: t['accent-glass'], borderColor: t['accent-border'] }]}>
            <Text accessibilityRole="alert" style={[styles.noticeText, { color: t['muted-flat'], fontFamily: fonts.body }]}>{reminderWarning}</Text>
            <Button variant="secondary" label="Retry" accessibilityLabel="Retry reminders" onPress={() => void retryReminders()} />
          </View>
        ) : null}

        <ProfileStrip name={user.name} userClass={user.userClass} rank={user.rank} stats={user.stats} completed={completed} total={total} />

        {recoveryRequired.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Recovery required: ${recoveryRequired.length} frozen ${recoveryRequired.length === 1 ? 'streak' : 'streaks'}`}
            onPress={() => setRecoveryOpen(true)}
            style={[styles.recovery, { borderColor: t['ice-border'], backgroundColor: t['panel-flat'] }]}>
            <SnowflakeIcon size={15} color={t.ice} />
            <Text style={[styles.recoveryText, { color: t.ice, fontFamily: fonts.display }]}>RECOVERY REQUIRED</Text>
            <Text style={[styles.recoveryCount, { color: t.ice, fontFamily: fonts.mono }]}>{String(recoveryRequired.length)}</Text>
          </Pressable>
        ) : null}

        <View testID="board-lane-tabs" accessibilityRole="tablist" style={styles.tabs}>
          {LANES.map(lane => {
            const selected = activeLane === lane.id;
            return (
              <Pressable
                key={lane.id}
                testID={`board-lane-tab-${lane.id}`}
                accessibilityRole="tab"
                accessibilityLabel={lane.label}
                accessibilityState={{ selected }}
                onPress={() => setActiveLane(lane.id)}
                style={[
                  styles.tab,
                  { borderColor: selected ? t['accent-border'] : t['glass-border'] },
                  selected && { backgroundColor: t['accent-glass'] },
                ]}>
                <Text style={[styles.tabText, { color: selected ? t['accent-text'] : t['muted-flat'], fontFamily: fonts.display }]}>
                  {lane.label} <Text style={{ color: selected ? t['accent-text'] : t['dim-flat'] }}>{counts[lane.id]}</Text>
                </Text>
              </Pressable>
            );
          })}
        </View>

        <SyncNotice waiting={syncWaiting} failed={failedSyncs.length} offline={syncOffline} onReview={() => setReviewOpen(true)} />

        {questsError && questsHaveCachedData ? (
          <View style={styles.notice}>
            <Text accessibilityRole="alert" style={[styles.noticeText, { color: t.danger, fontFamily: fonts.body }]}>{questsError}</Text>
            <Button variant="secondary" label="Retry quests" onPress={retryQuests} />
          </View>
        ) : null}
      </View>

      {firstLoadFailed ? (
        <StateBlock kind="error" retryLabel="Retry quests" onRetry={retryQuests}>{`Couldn't load quests: ${questsError}`}</StateBlock>
      ) : firstLoadRunning ? (
        <StateBlock kind="loading">{"Loading today's quests…"}</StateBlock>
      ) : (
        <PagerView
          testID="board-pager"
          ref={pagerRef}
          style={styles.pager}
          initialPage={0}
          scrollEnabled={!dragging}
          onPageSelected={(event: { nativeEvent: { position: number } }) => setActiveLane(LANES[event.nativeEvent.position]?.id ?? 'daily')}>
          {LANES.map(lane => {
            const active = activeLane === lane.id;
            return (
              <View
                key={lane.id}
                collapsable={false}
                accessibilityElementsHidden={!active}
                importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
                style={styles.page}>
                <ScrollView testID={`board-lane-scroll-${lane.id}`} scrollEnabled={!dragging} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">{lists[lane.id]}</ScrollView>
              </View>
            );
          })}
        </PagerView>
      )}

      {notice ? (
        <View style={styles.undo}>
          <UndoBar
            key={notice.id}
            message={`${notice.kind} archived`}
            onAction={() => restoreQuest(notice.questId)}
            secondaryLabel="View archived habits"
            onSecondary={() => router.setParams({ account: 'archived' })}
            onDismiss={() => setNotice(current => (current?.id === notice.id ? null : current))}
          />
        </View>
      ) : null}

      <View testID="board-footer" style={styles.footer}>
        {activeLane === 'daily' ? (
          <Button variant="secondary" label="ALL HABITS" icon={<ListIcon size={16} color={t['accent-text']} />} onPress={() => setAllHabitsOpen(true)} />
        ) : null}
        <Button variant="primary" label="ADD A QUEST" icon={<PlusIcon size={18} color={t['on-accent']} />} onPress={() => setAddOpen(true)} />
      </View>

      <ActionSheet
        visible={actionTarget !== null}
        title={actionTarget?.name}
        actions={actionTarget ? questActions(actionTarget, orderFor(actionTarget)) : []}
        onSelect={key => { if (actionTarget) runAction(key as QuestActionKey, actionTarget); }}
        onClose={() => setActionTarget(null)}
      />
      <QuestDetailsSheet
        quest={detailsTarget}
        accountToday={accountDateKey(new Date(), user.timeZone)}
        onClose={() => setDetailsTarget(null)}
        onEdit={() => { if (detailsTarget) openEditor(detailsTarget); setDetailsTarget(null); }}
      />
      <AllHabitsSheet
        visible={allHabitsOpen}
        habits={allHabits}
        pendingIds={pendingIds}
        onOpen={quest => { setAllHabitsOpen(false); setDetailsTarget(quest); }}
        onActions={quest => { setAllHabitsOpen(false); setActionTarget(quest); }}
        onClose={() => setAllHabitsOpen(false)}
      />
      <RecoverySheet
        visible={recoveryOpen && recoveryRequired.length > 0}
        quests={recoveryRequired}
        onComplete={id => { if (!syncOffline) flashXp(id, EASY_XP); completeRecovery(id); }}
        onClose={() => setRecoveryOpen(false)}
      />
      <SyncReviewSheet
        visible={reviewOpen && failedSyncs.length > 0}
        entries={failedSyncs}
        onRetry={retrySync}
        onDismiss={dismissSync}
        onClose={() => setReviewOpen(false)}
      />
      <AddQuestSheet visible={addOpen} types={OFFERED_TYPES} onChoose={choose} onClose={() => setAddOpen(false)} />
      <DeleteQuestModal
        quest={deleteTarget}
        pending={deletePending}
        error={deleteError}
        onCancel={() => { if (!deleteInFlight.current) setDeleteTarget(null); }}
        onConfirm={() => void confirmDelete()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  notice: { borderWidth: 1, borderColor: 'transparent', borderRadius: 4, padding: 10, gap: 8 },
  noticeText: { fontSize: 13, lineHeight: 19 },
  recovery: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 4, paddingHorizontal: 12 },
  recoveryText: { flex: 1, fontSize: 13, letterSpacing: 1.2 },
  recoveryCount: { fontSize: 13 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: { flexGrow: 1, flexBasis: '30%', minHeight: 48, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  tabText: { fontSize: 12, letterSpacing: 0.8, textAlign: 'center' },
  pager: { flex: 1, marginTop: 6 },
  page: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 12 },
  empty: { fontSize: 14, lineHeight: 21, paddingVertical: 24 },
  undo: { paddingHorizontal: 16, paddingBottom: 8 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, justifyContent: 'flex-end' },
});
