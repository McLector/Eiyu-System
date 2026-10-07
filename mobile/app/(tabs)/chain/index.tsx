import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  hasManualOrder,
  isChainFinished,
  LONG_QUEST_COPY,
  moveId,
  REORDER_COPY,
  reorderState,
  sortChains,
  STAT_COLORS,
  type LongQuest,
} from '@eiyu/shared';

import { MoreIcon, PlusIcon, StatIcon } from '@/components/eiyu/icons';
import { chainPercent, ChainProgressBar } from '@/components/chain/progress-bar';
import { ActionSheet } from '@/components/ui/action-sheet';
import { Button } from '@/components/ui/button';
import { ReorderableList } from '@/components/ui/reorderable-list';
import { StateBlock } from '@/components/ui/state-block';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import { useTokens } from '@/contexts/theme-store';

/** The tab bar floats over the content at normal font size; this keeps the footer clear of it. */

export default function ChainListScreen() {
  const t = useTokens();
  const { user, longQuestsLoading, longQuestsError, retryLongQuests, reorderChains } = useEiyu();
  const chains = sortChains(user.longQuests);
  const noData = chains.length === 0;
  // A grip is held: the list must not take the touch away.
  const [dragging, setDragging] = useState(false);
  const [actionTarget, setActionTarget] = useState<LongQuest | null>(null);
  // Only unfinished chains move, and only once every chain has a position; this is exactly what the server is sent.
  const movable = hasManualOrder(chains) ? chains.filter(chain => !isChainFinished(chain)).map(chain => chain.id) : null;
  const orderFor = (chain: LongQuest) => (movable && !isChainFinished(chain) ? reorderState(movable, chain.id) : null);
  const save = (ids: string[]) => { void reorderChains(ids).catch(() => {}); };
  const actions = (chain: LongQuest) => {
    const order = orderFor(chain);
    return order ? [
      { key: 'move-top', label: REORDER_COPY.moveTop, disabled: !order.canMoveUp },
      { key: 'move-up', label: REORDER_COPY.moveUp, disabled: !order.canMoveUp },
      { key: 'move-down', label: REORDER_COPY.moveDown, disabled: !order.canMoveDown },
    ] : [];
  };
  const runAction = (key: string, chain: LongQuest) => {
    if (!movable) return;
    const to = key === 'move-top' ? 'top' : key === 'move-up' ? 'up' : key === 'move-down' ? 'down' : null;
    if (to) save(moveId(movable, chain.id, to));
  };

  const card = (chain: LongQuest, grip?: ReactNode) => {
    const done = chain.stages.filter(stage => stage.done).length;
    const total = chain.stages.length;
    const percent = chainPercent(done, total);
    const color = STAT_COLORS[chain.stat];
    const movableChain = orderFor(chain) !== null;
    return (
      <View key={chain.id} style={[styles.card, { borderBottomColor: t['divider-flat'] }]}>
        {grip}
        <Pressable
          testID="chain-card"
          accessibilityRole="button"
          accessibilityLabel={`${chain.name}, ${done} of ${total} stages done`}
          onPress={() => router.push({ pathname: '/chain/[id]', params: { id: chain.id } })}
          style={styles.cardBody}>
          <View style={styles.cardTop}>
            <StatIcon stat={chain.stat} size={16} />
            <Text style={[styles.stat, { color, fontFamily: fonts.display }]}>{chain.stat}</Text>
            <Text numberOfLines={2} style={[styles.name, { color: t.text, fontFamily: fonts.display }]}>{chain.name}</Text>
            <Text style={[styles.count, { color: t['muted-flat'], fontFamily: fonts.mono }]}>{`${done}/${total}`}</Text>
          </View>
          <ChainProgressBar name={chain.name} percent={percent} color={color} />
        </Pressable>
        {movableChain ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`More actions for ${chain.name}`}
            onPress={() => setActionTarget(chain)}
            style={styles.more}>
            <MoreIcon size={20} color={t['muted-flat']} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: t['page-flat'] }]}>
      <ScrollView testID="chain-scroll" scrollEnabled={!dragging} contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>CHAIN PROGRESSION</Text>
          <Text style={[styles.sub, { color: t['muted-flat'], fontFamily: fonts.body }]}>20 XP per phase · 20 XP completion bonus</Text>
        </View>

        {longQuestsError && !noData ? (
          <StateBlock kind="error" retryLabel="Retry" onRetry={() => void retryLongQuests()}>{longQuestsError}</StateBlock>
        ) : null}
        {longQuestsLoading && noData ? (
          <StateBlock kind="loading">Reading your quest log…</StateBlock>
        ) : longQuestsError && noData ? (
          <StateBlock kind="error" retryLabel="Retry" onRetry={() => void retryLongQuests()}>{longQuestsError}</StateBlock>
        ) : noData ? (
          <StateBlock kind="empty" title={LONG_QUEST_COPY.emptyTitle}>{LONG_QUEST_COPY.empty}</StateBlock>
        ) : (
          movable ? (
            <>
              <ReorderableList
                items={movable.map(id => ({ id, name: chains.find(chain => chain.id === id)?.name ?? '' }))}
                onReorder={save}
                onDragChange={setDragging}
                renderRow={(id, grip) => card(chains.find(chain => chain.id === id)!, grip)}
              />
              {chains.filter(isChainFinished).map(chain => card(chain))}
            </>
          ) : (
            chains.map(chain => card(chain))
          )
        )}
      </ScrollView>

      <ActionSheet
        visible={actionTarget !== null}
        title={actionTarget?.name}
        actions={actionTarget ? actions(actionTarget) : []}
        onSelect={key => { if (actionTarget) runAction(key, actionTarget); }}
        onClose={() => setActionTarget(null)}
      />

      <View testID="chain-footer" style={styles.footer}>
        <Button
          testID="chain-new"
          variant="secondary"
          label="NEW CHAIN"
          icon={<PlusIcon size={18} color={t['accent-text']} />}
          onPress={() => router.push('/long-quest-editor')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },
  head: { marginBottom: 12, gap: 2 },
  title: { fontSize: 22, letterSpacing: 1 },
  sub: { fontSize: 12 },
  card: { minHeight: 72, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  cardBody: { flex: 1, minHeight: 48, paddingVertical: 14, gap: 10 },
  more: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stat: { fontSize: 12, letterSpacing: 1 },
  name: { flex: 1, fontSize: 17 },
  count: { fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
});
