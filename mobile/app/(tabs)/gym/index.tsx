import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GYM_COPY } from '@eiyu/shared';

import { ArchiveIcon, ChevronIcon, EditIcon, ListIcon, MoreIcon, PlusIcon, RestoreIcon, TrashIcon } from '@/components/eiyu/icons';
import { RoutinePickerSheet } from '@/components/gym/routine-picker-sheet';
import { ActionSheet } from '@/components/ui/action-sheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { DiscardChangesModal } from '@/components/ui/discard-changes-modal';
import { StateBlock } from '@/components/ui/state-block';
import { fonts } from '@/constants/eiyu-theme';
import { useGym } from '@/contexts/gym-store';
import { useTokens } from '@/contexts/theme-store';

/** The tab bar floats over the content at normal font size; this keeps the footer clear of it. */
const TAB_BAR_OVERLAY = 73;

export default function GymScreen() {
  const t = useTokens();
  const { fontScale } = useWindowDimensions();
  const gym = useGym();
  const { routine, routines, exercises, unit } = gym;
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** What the user asked for while a typed weight was unsaved, waiting for their answer. */
  const [switchTo, setSwitchTo] = useState<{ routineId: string } | { archived: boolean } | null>(null);
  const locked = gym.pending || gym.uncertain;

  const pick = (id: string) => {
    if (id === routine?.id) return;
    if (gym.dirty) setSwitchTo({ routineId: id });
    else gym.selectRoutine(id);
  };
  const includeArchived = (value: boolean) => {
    // Pin the routine being looked at first: with nothing picked yet, the list changing would move the view to another one.
    const apply = () => { if (routine) gym.selectRoutine(routine.id); gym.setShowArchived(value); };
    if (gym.dirty) setSwitchTo({ archived: value });
    else apply();
  };

  if (gym.loading) {
    return <View style={[styles.root, { backgroundColor: t['page-flat'] }]}><StateBlock kind="loading">Reading Gym Progress…</StateBlock></View>;
  }
  if (gym.loadError) {
    return <View style={[styles.root, { backgroundColor: t['page-flat'] }]}><StateBlock kind="error" retryLabel="Retry" onRetry={gym.retryLoad}>{gym.loadError}</StateBlock></View>;
  }

  const menuActions = routine ? [
    { key: 'edit', label: 'Edit routine', icon: <EditIcon color={t.text} /> },
    { key: 'archive', label: routine.archived ? 'Restore routine' : 'Archive routine', icon: routine.archived ? <RestoreIcon color={t.text} /> : <ArchiveIcon color={t.text} />, disabled: gym.dirty },
    { key: 'history', label: 'Workout history', icon: <ListIcon color={t.text} /> },
    { key: 'delete', label: 'Delete routine', icon: <TrashIcon color={t.danger} />, destructive: true },
  ] : [];

  return (
    <View style={[styles.root, { backgroundColor: t['page-flat'] }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>GYM PROGRESS</Text>

        {routine ? (
          <View style={styles.head}>
            <Pressable
              testID="gym-routine-chip"
              accessibilityRole="button"
              accessibilityLabel={`Routine ${routine.name}, ${unit}. Change routine`}
              disabled={locked}
              onPress={() => setPicker(true)}
              style={[styles.chip, { borderColor: t['accent-border'], backgroundColor: t['accent-glass'] }, locked && styles.dim]}>
              <Text numberOfLines={1} style={[styles.chipName, { color: t['accent-text'], fontFamily: fonts.display }]}>{routine.name}</Text>
              <Text style={[styles.chipUnit, { color: t['muted-flat'], fontFamily: fonts.mono }]}>{unit}</Text>
              <ChevronIcon direction="down" size={16} color={t['accent-text']} />
            </Pressable>
            <Pressable
              testID="gym-routine-menu"
              accessibilityRole="button"
              accessibilityLabel="Routine actions"
              disabled={locked}
              onPress={() => setMenu(true)}
              style={[styles.more, locked && styles.dim]}>
              <MoreIcon size={20} color={t['muted-flat']} />
            </Pressable>
          </View>
        ) : null}

        {gym.refreshError ? <StateBlock kind="error" retryLabel="Retry refresh" onRetry={gym.retryLoad}>{GYM_COPY.refreshFailed}</StateBlock> : null}
        {gym.recentError ? <StateBlock kind="error" retryLabel="Retry weights" onRetry={gym.retryRecent}>The System couldn&apos;t read your logged weights.</StateBlock> : null}
        {gym.error ? <Text accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>{gym.error}</Text> : null}
        {gym.notice ? <Text accessibilityLiveRegion="polite" style={[styles.note, { color: t['muted-flat'], fontFamily: fonts.body }]}>{gym.notice}</Text> : null}
        {gym.uncertain || gym.cleanupPending ? (
          <View style={styles.recover}>
            {gym.uncertain ? <Button variant="secondary" label={GYM_COPY.confirmSave} busy={gym.pending} onPress={() => void gym.retryUncertain()} /> : null}
            {gym.cleanupPending ? <Button variant="secondary" label="Retry media cleanup" onPress={() => void gym.retryCleanup()} /> : null}
          </View>
        ) : null}

        {!routine ? (
          <>
            <StateBlock kind="empty">{GYM_COPY.noRoutine}</StateBlock>
            <View style={styles.centered}>
              <Button variant="primary" label="NEW ROUTINE" icon={<PlusIcon size={18} color={t['on-accent']} />} onPress={() => router.push('/gym-routine-editor')} />
              {/* An archived routine, or the history of a deleted one, must stay reachable with nothing showing. */}
              <Chip kind="checkbox" label="Include archived" selected={gym.showArchived} onPress={() => includeArchived(!gym.showArchived)} />
              <Button variant="quiet" label="Workout history" onPress={() => router.push('/gym/history')} />
            </View>
          </>
        ) : exercises.length === 0 ? (
          <StateBlock kind="empty">No exercises yet. Add the first one.</StateBlock>
        ) : (
          exercises.map((exercise, index) => (
            <Pressable
              key={exercise.id}
              testID="gym-exercise-row"
              accessibilityRole="button"
              accessibilityLabel={`${index + 1}. ${exercise.name}, ${exercise.sets} sets of ${exercise.reps}`}
              onPress={() => router.push({ pathname: '/gym/[id]', params: { id: exercise.id } })}
              style={[styles.row, { borderBottomColor: t['divider-flat'] }]}>
              <Text style={[styles.index, { color: t['dim-flat'], fontFamily: fonts.mono }]}>{index + 1}</Text>
              <Text numberOfLines={2} style={[styles.name, { color: t.text, fontFamily: fonts.display }]}>{exercise.name}</Text>
              <Text style={[styles.sets, { color: t['muted-flat'], fontFamily: fonts.mono }]}>{`${exercise.sets} × ${exercise.reps}`}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      {routine ? (
        <View style={[styles.footer, { marginBottom: fontScale > 1.15 ? 0 : TAB_BAR_OVERLAY }]}>
          <Button
            testID="gym-add-exercise"
            variant="secondary"
            label="ADD EXERCISE"
            disabled={locked || routine.archived}
            icon={<PlusIcon size={18} color={t['accent-text']} />}
            onPress={() => router.push({ pathname: '/gym-exercise-editor', params: { routineId: routine.id } })}
          />
        </View>
      ) : null}

      <RoutinePickerSheet
        visible={picker}
        routines={routines}
        selectedId={routine?.id}
        showArchived={gym.showArchived}
        onToggleArchived={includeArchived}
        onSelect={pick}
        onNew={() => router.push('/gym-routine-editor')}
        onClose={() => setPicker(false)}
      />
      <ActionSheet
        visible={menu}
        title={routine?.name}
        actions={menuActions}
        onClose={() => setMenu(false)}
        onSelect={key => {
          if (!routine) return;
          if (key === 'edit') router.push({ pathname: '/gym-routine-editor', params: { id: routine.id } });
          else if (key === 'history') router.push('/gym/history');
          else if (key === 'archive') void gym.archiveRoutine();
          else if (key === 'delete') setConfirmDelete(true);
        }}
      />
      <ConfirmModal
        visible={confirmDelete}
        title="Delete routine"
        message={`Delete ${routine?.name ?? 'this routine'}? Logged weights remain in your history.`}
        confirmLabel="Delete Routine"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => { setConfirmDelete(false); void gym.deleteRoutine(); }}
      />
      <DiscardChangesModal
        visible={switchTo !== null}
        message="Your typed weights that were not logged will be lost."
        onKeep={() => setSwitchTo(null)}
        onDiscard={() => {
          const ask = switchTo;
          setSwitchTo(null);
          gym.resetDrafts();
          if (!ask) return;
          if ('routineId' in ask) gym.selectRoutine(ask.routineId);
          else { if (routine) gym.selectRoutine(routine.id); gym.setShowArchived(ask.archived); }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 8 },
  title: { fontSize: 22, letterSpacing: 1, marginBottom: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 4, paddingHorizontal: 12 },
  chipName: { flex: 1, fontSize: 16, letterSpacing: 0.6 },
  chipUnit: { fontSize: 12 },
  more: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.5 },
  note: { fontSize: 13, lineHeight: 19 },
  recover: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  centered: { alignItems: 'center', gap: 8 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  index: { width: 24, fontSize: 13 },
  name: { flex: 1, fontSize: 16 },
  sets: { fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
});
