import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import {
  accountDateKey,
  boardTodayProgress,
  EASY_XP,
  formatError,
  FULL_XP,
  partitionBoardQuests,
  type Quest,
} from '@eiyu/shared';

import { AddQuestSheet, type QuestTypeChoice } from '@/components/board/add-quest-sheet';
import { AllHabitsSheet } from '@/components/board/all-habits-sheet';
import { DeleteQuestModal } from '@/components/board/delete-quest-modal';
import { ProfileStrip } from '@/components/board/profile-strip';
import { questActions, type QuestActionKey } from '@/components/board/quest-actions';
import { QuestDetailsSheet } from '@/components/board/quest-details-sheet';
import { QuestRow } from '@/components/board/quest-row';
import { RecoverySheet } from '@/components/board/recovery-sheet';
import { ListIcon, PlusIcon, SnowflakeIcon } from '@/components/eiyu/icons';
import { ActionSheet } from '@/components/ui/action-sheet';
import { Button } from '@/components/ui/button';
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
  { id: 'one-time', label: 'ONE TIME QUEST' },
  { id: 'backlog', label: 'BACKLOG' },
];
/** The kinds the add sheet offers. Backlog joins once the quest editor can create one. */
const OFFERED_TYPES: QuestTypeChoice[] = ['habit', 'one_time'];
/** The tab bar floats over the content at normal font size; this keeps the footer clear of it. */
const TAB_BAR_OVERLAY = 73;

interface ArchiveNotice { id: number; questId: string; kind: 'Habit' | 'Quest' }

export default function BoardScreen() {
  const t = useTokens();
  const { fontScale } = useWindowDimensions();
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
    archiveQuest,
    restoreQuest,
    deleteQuest,
    moveToOneTime,
    moveToBacklog,
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
  const [notice, setNotice] = useState<ArchiveNotice | null>(null);
  const noticeSeq = useRef(0);
  const [deleteTarget, setDeleteTarget] = useState<Quest | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteInFlight = useRef(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  const inFlight = useRef(new Set<string>());

  useFocusEffect(useCallback(() => {
    const returnLane = consumeBoardReturnIntent();
    if (returnLane) setActiveLane(returnLane);
  }, []));

  // The tab and a swipe both end up here: keep the pager on the selected lane.
  useEffect(() => {
    pagerRef.current?.setPage?.(LANES.findIndex(lane => lane.id === activeLane));
  }, [activeLane]);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const { dailyQuests, recoveryRequired, oneTimeQuests, allHabits } = partitionBoardQuests(user.quests);
  const { completed, total } = boardTodayProgress({ dailyQuests, oneTimeQuests });
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

  const openEditor = (quest: Quest) => router.push({ pathname: '/quest-editor', params: { id: quest.id } });

  const runAction = (key: QuestActionKey, quest: Quest) => {
    if (key === 'details') setDetailsTarget(quest);
    else if (key === 'edit') openEditor(quest);
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
    if (!quest.completed) {
      // Milestone: completing gets the success cue; undo is a plain tap.
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

  const row = (quest: Quest) => (
    <QuestRow
      key={quest.id}
      quest={quest}
      pending={pendingIds.has(quest.id)}
      xpToast={xpToast?.id === quest.id ? xpToast.xp : null}
      onToggle={() => handleToggle(quest)}
      onOpen={() => setDetailsTarget(quest)}
      onAdjustProgress={delta => adjustProgress(quest.id, delta)}
      onActions={() => setActionTarget(quest)}
    />
  );

  const empty = (text: string) => <Text style={[styles.empty, { color: t['muted-flat'], fontFamily: fonts.body }]}>{text}</Text>;

  const lists: Record<LaneId, React.ReactNode> = {
    daily: dailyQuests.length === 0 ? empty('No habits are scheduled for today. Create one or check All Habits.') : dailyQuests.map(row),
    'one-time': oneTimeQuests.length === 0 ? empty('No one-time quests scheduled for today.') : oneTimeQuests.map(row),
    backlog: backlog.length === 0 ? empty('Nothing in the Backlog. Capture an idea with ADD A QUEST.') : backlog.map(row),
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
                <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">{lists[lane.id]}</ScrollView>
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

      <View style={[styles.footer, { marginBottom: fontScale > 1.15 ? 0 : TAB_BAR_OVERLAY }]}>
        {activeLane === 'daily' ? (
          <Button variant="secondary" label="ALL HABITS" icon={<ListIcon size={16} color={t['accent-text']} />} onPress={() => setAllHabitsOpen(true)} />
        ) : null}
        <Button variant="primary" label="ADD A QUEST" icon={<PlusIcon size={18} color={t['on-accent']} />} onPress={() => setAddOpen(true)} />
      </View>

      <ActionSheet
        visible={actionTarget !== null}
        title={actionTarget?.name}
        actions={actionTarget ? questActions(actionTarget) : []}
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
        onComplete={id => { flashXp(id, EASY_XP); completeRecovery(id); }}
        onClose={() => setRecoveryOpen(false)}
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
