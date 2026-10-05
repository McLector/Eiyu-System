import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import PagerView from 'react-native-pager-view';
import { GYM_COPY, type GymExercise } from '@eiyu/shared';

import { ChevronIcon, EditIcon, MoreIcon, TrashIcon } from '@/components/eiyu/icons';
import { ExerciseMedia } from '@/components/gym/exercise-media';
import { ActionSheet } from '@/components/ui/action-sheet';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { StateBlock } from '@/components/ui/state-block';
import { fonts } from '@/constants/eiyu-theme';
import { useGym } from '@/contexts/gym-store';
import { useTokens } from '@/contexts/theme-store';

/** The tab bar floats over the content; the card's last row stays clear of it. */
const TAB_BAR_OVERLAY = 73;

function Tile({ label, value }: { label: string; value: string }) {
  const t = useTokens();
  return (
    <View style={[styles.tile, { borderColor: t['glass-border'] }]} accessible accessibilityLabel={`${label} ${value}`}>
      <Text style={[styles.tileLabel, { color: t['muted-flat'], fontFamily: fonts.display }]}>{label}</Text>
      <Text style={[styles.tileValue, { color: t.text, fontFamily: fonts.mono }]}>{value}</Text>
    </View>
  );
}

export default function GymExerciseCardScreen() {
  const t = useTokens();
  const { fontScale } = useWindowDimensions();
  const gym = useGym();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { exercises, routine, unit } = gym;
  const startIndex = exercises.findIndex(e => e.id === id);
  const pager = useRef<PagerView>(null);
  const [currentId, setCurrentId] = useState(id ?? '');
  const [menu, setMenu] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const found = startIndex >= 0 || exercises.some(e => e.id === currentId);
  const index = Math.max(0, exercises.findIndex(e => e.id === currentId));
  const current = exercises[index];
  const locked = !routine || routine.archived || gym.uncertain;

  // A move changes the exercise's place in the pager; follow it so the card stays on screen.
  const lastIndex = useRef(index);
  useEffect(() => {
    if (lastIndex.current !== index) pager.current?.setPageWithoutAnimation?.(index);
    lastIndex.current = index;
  }, [index]);

  if (!found || !current) {
    return (
      <View style={[styles.root, { backgroundColor: t['page-flat'] }]}>
        <StateBlock kind="empty" title="EXERCISE NOT FOUND">This exercise was removed or is no longer available.</StateBlock>
        <View style={styles.centered}><Button variant="secondary" label="BACK TO GYM" onPress={() => router.back()} /></View>
      </View>
    );
  }

  const go = (to: number) => {
    if (to < 0 || to >= exercises.length) return;
    setCurrentId(exercises[to].id);
    pager.current?.setPage?.(to);
  };
  const saved = (e: GymExercise) => String(gym.logged(e.id, 1) ?? '');

  const menuActions = [
    { key: 'edit', label: 'Edit exercise', icon: <EditIcon color={t.text} /> },
    { key: 'up', label: 'Move up', disabled: index === 0 },
    { key: 'down', label: 'Move down', disabled: index === exercises.length - 1 },
    { key: 'remove', label: 'Remove', icon: <TrashIcon color={t.danger} />, destructive: true },
  ];

  return (
    <View style={[styles.root, { backgroundColor: t['page-flat'] }]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to exercises" onPress={() => router.back()} style={styles.iconButton}>
          <ChevronIcon direction="left" size={20} color={t['muted-flat']} />
        </Pressable>
        <View style={styles.headText}>
          <Text numberOfLines={1} style={[styles.routine, { color: t['muted-flat'], fontFamily: fonts.display }]}>{routine?.name}</Text>
          <Text accessibilityLiveRegion="polite" style={[styles.counter, { color: t.text, fontFamily: fonts.mono }]}>{`${index + 1} / ${exercises.length}`}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Exercise actions for ${current.name}`}
          disabled={gym.pending || gym.uncertain}
          onPress={() => setMenu(true)}
          style={[styles.iconButton, (gym.pending || gym.uncertain) && styles.dim]}>
          <MoreIcon size={20} color={t['muted-flat']} />
        </Pressable>
      </View>

      <PagerView
        ref={pager}
        testID="gym-pager"
        style={styles.pager}
        initialPage={Math.max(0, startIndex)}
        onPageSelected={event => {
          const next = exercises[event.nativeEvent.position];
          if (next) setCurrentId(next.id);
        }}>
        {exercises.map(exercise => {
          const draft = gym.draft(exercise.id);
          const canLog = !gym.pending && !locked && draft.trim() !== '' && draft !== saved(exercise);
          const previous = gym.logged(exercise.id, 2);
          return (
            <View key={exercise.id} testID={`gym-card-${exercise.id}`} style={styles.page}>
              <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.card}>
                <Text accessibilityRole="header" style={[styles.name, { color: t.text, fontFamily: fonts.display }]}>{exercise.name}</Text>
                <ExerciseMedia exercise={exercise} canEdit={!gym.pending && !gym.uncertain} onEdit={() => router.push({ pathname: '/gym-exercise-editor', params: { routineId: exercise.routine_id, id: exercise.id } })} active={exercise.id === current.id} />
                {exercise.notes ? (
                  <View accessible accessibilityLabel={`Notes for ${exercise.name}`} style={styles.notes}>
                    <Text style={[styles.notesLabel, { color: t['muted-flat'], fontFamily: fonts.display }]}>NOTES</Text>
                    <Text style={[styles.notesText, { color: t.text, fontFamily: fonts.body }]}>{exercise.notes}</Text>
                  </View>
                ) : null}
                <View style={styles.tiles}>
                  <Tile label="Sets × reps" value={`${exercise.sets} × ${exercise.reps}`} />
                  <Tile label="Rest" value={`${exercise.rest_seconds}s`} />
                  <Tile label="RIR" value={`${exercise.rir}${exercise.rir_max ? `-${exercise.rir_max}` : ''}`} />
                  <Tile label="Previous" value={previous === null ? '—' : `${previous} ${unit}`} />
                </View>
                <View style={styles.current}>
                  <Text style={[styles.currentLabel, { color: t['muted-flat'], fontFamily: fonts.display }]}>CURRENT WEIGHT</Text>
                  <View style={styles.weightRow}>
                    <WeightInput exercise={exercise} unit={unit} value={draft} locked={locked} readOnly={gym.pending} onChange={value => gym.setDraft(exercise.id, value)} />
                  </View>
                  <Button testID={`gym-log-${exercise.id}`} variant="primary" label="LOG WEIGHT" accessibilityLabel="LOG WEIGHT" disabled={!canLog} busy={gym.pending} onPress={() => void gym.logWeight(exercise)} />
                </View>
              </KeyboardAwareScrollView>
            </View>
          );
        })}
      </PagerView>

      <View style={[styles.footer, { borderTopColor: t['divider-flat'], paddingBottom: 8 + (fontScale > 1.15 ? 0 : TAB_BAR_OVERLAY) }]}>
        {gym.error ? <Text accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>{gym.error}</Text> : null}
        {gym.notice ? <Text accessibilityLiveRegion="polite" style={[styles.note, { color: t['muted-flat'], fontFamily: fonts.body }]}>{gym.notice}</Text> : null}
        {gym.uncertain ? <Button variant="secondary" label={GYM_COPY.confirmSave} busy={gym.pending} onPress={() => void gym.retryUncertain()} /> : null}
        <View style={styles.nav}>
          <Button variant="secondary" label="Prev" accessibilityLabel="Previous exercise" disabled={index === 0} onPress={() => go(index - 1)} style={styles.navButton} />
          <Button variant="secondary" label="Next" accessibilityLabel="Next exercise" disabled={index === exercises.length - 1} onPress={() => go(index + 1)} style={styles.navButton} />
        </View>
      </View>

      <ActionSheet
        visible={menu}
        title={current.name}
        actions={menuActions}
        onClose={() => setMenu(false)}
        onSelect={key => {
          if (key === 'edit') router.push({ pathname: '/gym-exercise-editor', params: { routineId: current.routine_id, id: current.id } });
          else if (key === 'up') void gym.moveExercise(current, -1);
          else if (key === 'down') void gym.moveExercise(current, 1);
          else if (key === 'remove') setConfirmRemove(true);
        }}
      />
      <ConfirmModal
        visible={confirmRemove}
        title="Remove exercise"
        message={`Remove ${current.name}? Logged weights remain in your history.`}
        confirmLabel="Remove Exercise"
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          // Move to the neighbour first so the card never points at an exercise that is about to disappear.
          const neighbour = exercises[index + 1] ?? exercises[index - 1];
          if (neighbour) setCurrentId(neighbour.id);
          void gym.removeExercise(current).then(removed => {
            if (!removed) setCurrentId(current.id);
            else if (!neighbour) router.back();
          });
        }}
      />
    </View>
  );
}

function WeightInput({ exercise, unit, value, locked, readOnly, onChange }: { exercise: GymExercise; unit: string; value: string; locked: boolean; readOnly: boolean; onChange: (value: string) => void }) {
  const t = useTokens();
  return (
    <>
      <TextInput
        testID={`gym-weight-${exercise.id}`}
        accessibilityLabel={`Current weight for ${exercise.name} in ${unit}`}
        keyboardType="decimal-pad"
        value={value}
        onChangeText={onChange}
        editable={!locked && !readOnly}
        selectTextOnFocus
        placeholder="0"
        placeholderTextColor={t['dim-flat']}
        style={[styles.weight, { color: t.text, borderColor: t['glass-border'], backgroundColor: t.track, fontFamily: fonts.mono }, locked && styles.dim]}
      />
      <Text accessibilityElementsHidden importantForAccessibility="no" style={[styles.unit, { color: t['muted-flat'], fontFamily: fonts.display }]}>{unit}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  headText: { flex: 1, alignItems: 'center' },
  routine: { fontSize: 12, letterSpacing: 1 },
  counter: { fontSize: 14 },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.5 },
  pager: { flex: 1 },
  page: { flex: 1 },
  card: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  name: { fontSize: 22, letterSpacing: 0.8 },
  notes: { gap: 4 },
  notesLabel: { fontSize: 11, letterSpacing: 1.2 },
  notesText: { fontSize: 14, lineHeight: 21 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, flexBasis: '45%', minHeight: 56, borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  tileLabel: { fontSize: 11, letterSpacing: 1 },
  tileValue: { fontSize: 16 },
  current: { gap: 8 },
  currentLabel: { fontSize: 11, letterSpacing: 1.2 },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weight: { flex: 1, minHeight: 64, borderWidth: 1, borderRadius: 4, paddingHorizontal: 16, fontSize: 32 },
  unit: { fontSize: 18, minWidth: 28 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  note: { fontSize: 13, lineHeight: 19 },
  nav: { flexDirection: 'row', gap: 8 },
  navButton: { flex: 1 },
});
