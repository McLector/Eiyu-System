import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LONG_QUEST_COPY, STAT_COLORS } from '@eiyu/shared';

import { PlusIcon, StatIcon } from '@/components/eiyu/icons';
import { chainPercent, ChainProgressBar } from '@/components/chain/progress-bar';
import { Button } from '@/components/ui/button';
import { StateBlock } from '@/components/ui/state-block';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import { useTokens } from '@/contexts/theme-store';

/** The tab bar floats over the content at normal font size; this keeps the footer clear of it. */

export default function ChainListScreen() {
  const t = useTokens();
  const { user, longQuestsLoading, longQuestsError, retryLongQuests } = useEiyu();
  const chains = user.longQuests;
  const noData = chains.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: t['page-flat'] }]}>
      <ScrollView contentContainerStyle={styles.content}>
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
          chains.map(chain => {
            const done = chain.stages.filter(stage => stage.done).length;
            const total = chain.stages.length;
            const percent = chainPercent(done, total);
            const color = STAT_COLORS[chain.stat];
            return (
              <Pressable
                key={chain.id}
                testID="chain-card"
                accessibilityRole="button"
                accessibilityLabel={`${chain.name}, ${done} of ${total} stages done`}
                onPress={() => router.push({ pathname: '/chain/[id]', params: { id: chain.id } })}
                style={[styles.card, { borderBottomColor: t['divider-flat'] }]}>
                <View style={styles.cardTop}>
                  <StatIcon stat={chain.stat} size={16} />
                  <Text style={[styles.stat, { color, fontFamily: fonts.display }]}>{chain.stat}</Text>
                  <Text numberOfLines={2} style={[styles.name, { color: t.text, fontFamily: fonts.display }]}>{chain.name}</Text>
                  <Text style={[styles.count, { color: t['muted-flat'], fontFamily: fonts.mono }]}>{`${done}/${total}`}</Text>
                </View>
                <ChainProgressBar name={chain.name} percent={percent} color={color} />
              </Pressable>
            );
          })
        )}
      </ScrollView>

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
  card: { minHeight: 72, paddingVertical: 14, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stat: { fontSize: 12, letterSpacing: 1 },
  name: { flex: 1, fontSize: 17 },
  count: { fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
});
