import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CHAIN_ORDER_COPY, formatDisplayDate, formatError, STAT_COLORS, stageSequenceState, type LongQuest } from '@eiyu/shared';

import { chainPercent, ChainProgressBar } from '@/components/chain/progress-bar';
import { CheckIcon, ChevronIcon, EditIcon, LockIcon, MoreIcon, StatIcon, TrashIcon, UndoIcon } from '@/components/eiyu/icons';
import { ActionSheet, type SheetAction } from '@/components/ui/action-sheet';
import { Button } from '@/components/ui/button';
import { RewardFeedback } from '@/components/ui/reward-feedback';
import { StateBlock } from '@/components/ui/state-block';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import { useTokens } from '@/contexts/theme-store';

// "open" is an unfinished stage of a chain done in any order: nothing locks it and none is "the" current one.
type StageStatus = 'done' | 'current' | 'open' | 'locked';
const STATUS_LABEL: Record<StageStatus, string> = { done: 'Done', current: 'Current', open: 'Open', locked: 'Locked' };
const DESCRIPTION_CLAMP_AT = 140;
/** The tab bar floats over the content at normal font size; this keeps the last stage clear of it. */

function Stats({ chain, done, timeZone }: { chain: LongQuest; done: number; timeZone: string }) {
  const t = useTokens();
  const cells = [
    { label: 'Stages', value: String(chain.stages.length) },
    { label: 'Done', value: String(done) },
    { label: 'Order', value: chain.strictOrder === false ? CHAIN_ORDER_COPY.anyOrder : CHAIN_ORDER_COPY.inOrder },
    { label: 'Created', value: chain.createdAt ? formatDisplayDate(new Date(chain.createdAt), timeZone) : '—' },
    { label: 'Finished', value: chain.completedAt ? formatDisplayDate(new Date(chain.completedAt), timeZone) : '—' },
  ];
  return (
    <View testID="chain-stats" style={styles.stats}>
      {cells.map(cell => (
        <View key={cell.label} accessible accessibilityLabel={`${cell.label}: ${cell.value}`} style={styles.statCell}>
          <Text style={[styles.statLabel, { color: t['dim-flat'], fontFamily: fonts.display }]}>{cell.label}</Text>
          <Text style={[styles.statValue, { color: t.text, fontFamily: fonts.body }]}>{cell.value}</Text>
        </View>
      ))}
    </View>
  );
}

function DeleteChainModal({ chain, pending, error, onCancel, onConfirm }: { chain: LongQuest | null; pending: boolean; error: string | null; onCancel: () => void; onConfirm: () => void }) {
  const t = useTokens();
  return (
    <Modal testID="chain-delete-modal" visible={chain !== null} transparent animationType="fade" onRequestClose={() => { if (!pending) onCancel(); }}>
      <View style={[styles.overlay, { backgroundColor: t.overlay }]} accessibilityViewIsModal>
        <View style={[styles.dialog, { backgroundColor: t.modal, borderColor: t['danger-border'] }]}>
          <Text accessibilityRole="header" style={[styles.dialogTitle, { color: t.text, fontFamily: fonts.display }]}>DELETE LONG QUEST</Text>
          <Text style={[styles.dialogText, { color: t['muted-flat'], fontFamily: fonts.body }]}>{`Delete ${chain?.name ?? ''} and its stages? Earned XP remains.`}</Text>
          {error ? <Text accessibilityRole="alert" style={[styles.dialogText, { color: t.danger, fontFamily: fonts.body }]}>{error}</Text> : null}
          <View style={styles.dialogActions}>
            <Button testID="chain-delete-cancel" variant="quiet" label="Cancel" disabled={pending} onPress={onCancel} />
            <Button testID="chain-delete-confirm" variant="destructive" label="Delete Long Quest" busy={pending} onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function ChainDetailScreen() {
  const t = useTokens();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const {
    user, longQuestsLoading, longQuestsError, retryLongQuests, toggleStage, removeLongQuest,
    pendingStageIds = [], rewardReceipt, stageRewardNotice, clearStageReward,
  } = useEiyu();
  const chain = user.longQuests.find(q => q.id === id) ?? null;

  // Stages whose details the viewer flipped away from the default; the current stage starts open and that default
  // follows progress rather than staying on the stage that was current when the screen opened.
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set());
  const [fullNote, setFullNote] = useState(false);
  const [menu, setMenu] = useState<{ kind: 'chain' } | { kind: 'stage'; id: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Leaving the chain drops its XP card so it does not reappear on the next visit.
  useEffect(() => () => clearStageReward(), [clearStageReward]);

  const back = (
    <Pressable
      testID="chain-back"
      accessibilityRole="button"
      accessibilityLabel="Back to chains"
      onPress={() => router.back()}
      style={styles.back}>
      <ChevronIcon direction="left" size={18} color={t['muted-flat']} />
      <Text style={[styles.backText, { color: t['muted-flat'], fontFamily: fonts.display }]}>CHAINS</Text>
    </Pressable>
  );

  if (!chain) {
    return (
      <View style={[styles.root, { backgroundColor: t['page-flat'] }]}>
        <View style={styles.bar}>{back}</View>
        {longQuestsLoading ? (
          <StateBlock kind="loading">Reading your quest log…</StateBlock>
        ) : (
          <StateBlock kind="empty" title="CHAIN NOT FOUND">This chain was deleted or is no longer available.</StateBlock>
        )}
      </View>
    );
  }

  const color = STAT_COLORS[chain.stat];
  const strictOrder = chain.strictOrder !== false;
  const statuses = chain.stages.map((stage, index) => {
    const sequence = stageSequenceState(chain.stages, index, strictOrder);
    const status: StageStatus = stage.done ? 'done' : sequence.locked ? 'locked' : strictOrder ? 'current' : 'open';
    return { stage, sequence, status };
  });
  // The stage whose details start open: the current one, or the first open one when order does not matter.
  const currentId = statuses.find(item => item.status === 'current' || item.status === 'open')?.stage.id;
  const isOpen = (stageId: string) => (stageId === currentId) !== flipped.has(stageId);
  const toggleOpen = (stageId: string) => setFlipped(prev => { const next = new Set(prev); if (next.has(stageId)) next.delete(stageId); else next.add(stageId); return next; });
  const done = chain.stages.filter(stage => stage.done).length;
  const percent = chainPercent(done, chain.stages.length);
  const note = chain.description ?? '';
  const longNote = note.length > DESCRIPTION_CLAMP_AT || note.includes('\n');
  const rewardCardShown = !!rewardReceipt && !rewardReceipt.replayed && rewardReceipt.totals.length > 0;

  const menuStage = menu?.kind === 'stage' ? statuses.find(item => item.stage.id === menu.id) : undefined;
  const stageActions = (item: (typeof statuses)[number]): SheetAction[] => [
    ...(item.stage.description ? [{ key: 'toggle', label: isOpen(item.stage.id) ? 'Hide details' : 'Show details', icon: <ChevronIcon direction={isOpen(item.stage.id) ? 'up' : 'down'} size={14} color={t.text} /> }] : []),
    // In order, only the last finished stage can be undone (the database enforces it); in any order, every finished stage can.
    ...(item.stage.done && !item.sequence.locked ? [{ key: 'undo', label: 'Mark not done', icon: <UndoIcon size={16} color={t.text} />, disabled: pendingStageIds.includes(item.stage.id) }] : []),
  ];
  const chainActions: SheetAction[] = [
    { key: 'edit', label: 'Edit', icon: <EditIcon size={16} color={t.text} /> },
    { key: 'delete', label: 'Delete', icon: <TrashIcon size={16} color={t.danger} />, destructive: true },
  ];

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await removeLongQuest(chain.id);
      setConfirmDelete(false);
      router.back();
    } catch (err) {
      setDeleteError(formatError(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: t['page-flat'] }]}>
      <View style={styles.bar}>
        {back}
        <Pressable
          testID="chain-more"
          accessibilityRole="button"
          accessibilityLabel={`More actions for ${chain.name}`}
          onPress={() => setMenu({ kind: 'chain' })}
          style={styles.more}>
          <MoreIcon size={20} color={t['muted-flat']} />
        </Pressable>
      </View>

      <ScrollView testID="chain-scroll" contentContainerStyle={styles.content}>
        {stageRewardNotice ? (
          // The XP card is itself a live region; announce the notice only when no card carries it.
          <Text
            accessibilityLiveRegion={rewardCardShown ? 'none' : 'polite'}
            style={[styles.notice, { color: t.success, fontFamily: fonts.body }]}>
            {stageRewardNotice}
          </Text>
        ) : null}
        <RewardFeedback receipt={rewardReceipt} />
        {longQuestsError ? <StateBlock kind="error" retryLabel="Retry" onRetry={() => void retryLongQuests()}>{longQuestsError}</StateBlock> : null}

        <View style={styles.titleBlock}>
          <View style={styles.statLine}>
            <StatIcon stat={chain.stat} size={16} />
            <Text style={[styles.statCode, { color, fontFamily: fonts.display }]}>{chain.stat}</Text>
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>{chain.name}</Text>
        </View>

        {note ? (
          <View>
            <Text numberOfLines={longNote && !fullNote ? 3 : undefined} style={[styles.note, { color: t['muted-flat'], fontFamily: fonts.body }]}>{note}</Text>
            {longNote ? (
              <Button variant="quiet" label={fullNote ? 'Show less' : 'Show more'} accessibilityLabel={fullNote ? 'Show less' : 'Show more'} onPress={() => setFullNote(open => !open)} />
            ) : null}
          </View>
        ) : null}

        <Stats chain={chain} done={done} timeZone={user.timeZone} />

        <View style={styles.progress}>
          <View style={styles.progressHead}>
            <Text style={[styles.statLabel, { color: t['dim-flat'], fontFamily: fonts.display }]}>PROGRESS</Text>
            <Text style={[styles.percent, { color: t.text, fontFamily: fonts.mono }]}>{`${percent}%`}</Text>
          </View>
          <ChainProgressBar name={chain.name} percent={percent} color={color} />
        </View>

        {chain.stages.length === 0 ? (
          <Text style={[styles.note, { color: t['muted-flat'], fontFamily: fonts.body }]}>This chain has no stages yet. Edit it to add the first one.</Text>
        ) : (
          <View accessibilityLabel="Stages" style={styles.stages}>
            {statuses.map((item, index) => {
              const { stage, sequence, status } = item;
              const open = isOpen(stage.id);
              const pending = pendingStageIds.includes(stage.id);
              const hasMenu = stageActions(item).length > 0;
              const tint = status === 'done' ? t.success : status === 'current' || status === 'open' ? t['accent-text'] : t['dim-flat'];
              return (
                <View key={stage.id} testID={`stage-${stage.id}`} style={[styles.stage, { borderBottomColor: t['divider-flat'] }, status === 'locked' && styles.locked]}>
                  <View style={styles.stageRow}>
                    <View style={[styles.mark, { borderColor: tint }]}>
                      {status === 'done' ? <CheckIcon size={13} color={tint} /> : status === 'locked' ? <LockIcon size={13} color={tint} /> : <Text style={{ color: tint, fontFamily: fonts.mono, fontSize: 12 }}>{index + 1}</Text>}
                    </View>
                    <Text style={[styles.stageName, { color: status === 'done' ? t['muted-flat'] : t.text, fontFamily: fonts.body }]}>{stage.name}</Text>
                    <Text style={[styles.statusLabel, { color: tint, fontFamily: fonts.display }]}>{STATUS_LABEL[status]}</Text>
                    {hasMenu ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Actions for ${stage.name}`}
                        onPress={() => setMenu({ kind: 'stage', id: stage.id })}
                        style={styles.more}>
                        <MoreIcon size={20} color={t['muted-flat']} />
                      </Pressable>
                    ) : null}
                  </View>
                  {status === 'locked' ? (
                    <Text style={[styles.reason, { color: t['dim-flat'], fontFamily: fonts.body }]}>{sequence.reason ?? 'Complete earlier stages first.'}</Text>
                  ) : null}
                  {open && stage.description ? (
                    <Text style={[styles.stageDescription, { color: t['muted-flat'], fontFamily: fonts.body }]}>{stage.description}</Text>
                  ) : null}
                  {status === 'current' ? (
                    <Button
                      testID="stage-complete"
                      variant="primary"
                      label="COMPLETE STAGE"
                      icon={<CheckIcon size={16} color={t['on-accent']} />}
                      disabled={pending}
                      onPress={() => toggleStage(chain.id, stage.id)}
                    />
                  ) : null}
                  {status === 'open' ? (
                    <Button
                      testID={`stage-complete-${stage.id}`}
                      variant="secondary"
                      label="COMPLETE STAGE"
                      accessibilityLabel={`COMPLETE STAGE: ${stage.name}`}
                      icon={<CheckIcon size={16} color={t['accent-text']} />}
                      disabled={pending}
                      onPress={() => toggleStage(chain.id, stage.id)}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <ActionSheet
        visible={menu?.kind === 'chain'}
        title={chain.name}
        actions={chainActions}
        onSelect={key => {
          if (key === 'edit') router.push({ pathname: '/long-quest-editor', params: { id: chain.id } });
          if (key === 'delete') { setDeleteError(null); setConfirmDelete(true); }
        }}
        onClose={() => setMenu(null)}
      />
      <ActionSheet
        visible={!!menuStage}
        title={menuStage?.stage.name}
        actions={menuStage ? stageActions(menuStage) : []}
        onSelect={key => {
          if (!menuStage) return;
          if (key === 'toggle') toggleOpen(menuStage.stage.id);
          if (key === 'undo') toggleStage(chain.id, menuStage.stage.id);
        }}
        onClose={() => setMenu(null)}
      />
      <DeleteChainModal
        chain={confirmDelete ? chain : null}
        pending={deleting}
        error={deleteError}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  back: { minHeight: 48, minWidth: 48, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 },
  backText: { fontSize: 13, letterSpacing: 1 },
  more: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 16 },
  notice: { fontSize: 13 },
  titleBlock: { gap: 6 },
  statLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statCode: { fontSize: 12, letterSpacing: 1 },
  title: { fontSize: 24, letterSpacing: 0.5 },
  note: { fontSize: 14, lineHeight: 21 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCell: { flexGrow: 1, flexBasis: '40%', gap: 2 },
  statLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  statValue: { fontSize: 15 },
  progress: { gap: 6 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between' },
  percent: { fontSize: 13 },
  stages: { gap: 0 },
  stage: { paddingVertical: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  locked: { opacity: 0.7 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  mark: { width: 26, height: 26, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  stageName: { flex: 1, fontSize: 15 },
  statusLabel: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  reason: { fontSize: 12, paddingLeft: 36 },
  stageDescription: { fontSize: 13, lineHeight: 19, paddingLeft: 36 },
  overlay: { flex: 1, justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 480, alignSelf: 'center', borderWidth: 1, borderRadius: 4, padding: 20, gap: 10 },
  dialogTitle: { fontSize: 18, letterSpacing: 0.8 },
  dialogText: { fontSize: 14, lineHeight: 21 },
  dialogActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
});
