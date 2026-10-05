import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatError, GYM_COPY, newRequestId, normalizeEditableQuestName, saveGymRoutine, UncertainSaveError, type GymUnit } from '@eiyu/shared';

import { EditorFrame } from '@/components/gym/editor-frame';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { StateBlock } from '@/components/ui/state-block';
import { fonts } from '@/constants/eiyu-theme';
import { useGym } from '@/contexts/gym-store';
import { useTokens } from '@/contexts/theme-store';
import { hapticSuccess } from '@/lib/haptics';

const UNITS: GymUnit[] = ['kg', 'lb'];

function nameProblem(name: string): string | null {
  try { normalizeEditableQuestName(name); return null; } catch { return 'Enter a routine name.'; }
}

export default function GymRoutineEditorScreen() {
  const t = useTokens();
  const gym = useGym();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const routine = id ? gym.routines.find(r => r.id === id) ?? null : null;

  const [name, setName] = useState(routine?.name ?? '');
  const [touched, setTouched] = useState(false);
  const [unit, setUnit] = useState<GymUnit>(routine?.unit ?? 'kg');
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const committed = useRef(false);
  /** Made once, so a retry of an unconfirmed create cannot make a second routine. */
  const [creationId] = useState(newRequestId);
  const busy = saving || uncertain;
  const dirty = name !== (routine?.name ?? '') || unit !== (routine?.unit ?? 'kg');
  const problem = nameProblem(name);
  const editing = routine !== null;

  const save = async () => {
    if (problem || saving) return;
    setSaving(true);
    setError(null);
    try {
      const savedId = await saveGymRoutine(gym.userId!, name, unit, routine?.id, creationId);
      setUncertain(false);
      hapticSuccess();
      committed.current = true;
      router.back();
      await gym.refreshAfterSave('Routine', savedId);
    } catch (err) {
      setUncertain(err instanceof UncertainSaveError);
      setError(formatError(err));
    } finally {
      setSaving(false);
    }
  };

  const frame = { closeLabel: 'Close routine editor', testID: 'gym-routine-editor', onClose: () => router.back() };
  if (id && !routine) {
    return (
      <EditorFrame {...frame} title="EDIT ROUTINE" dirty={false} busy={false} uncertain={false} committed={committed} discardMessage="" onLeaveUnconfirmed={() => {}} footer={null}>
        <StateBlock kind="empty" title="ROUTINE NOT FOUND">This routine was deleted or is no longer available.</StateBlock>
      </EditorFrame>
    );
  }

  return (
    <EditorFrame
      {...frame}
      title={editing ? 'EDIT ROUTINE' : 'NEW ROUTINE'}
      dirty={dirty}
      busy={busy}
      uncertain={uncertain && !saving}
      committed={committed}
      discardMessage="Your unsaved routine changes will be lost."
      onLeaveUnconfirmed={gym.retryLoad}
      error={error}
      footer={(
        <Button
          testID="gym-routine-save"
          variant="primary"
          label={saving ? 'SAVING…' : uncertain ? GYM_COPY.confirmSave : editing ? 'SAVE CHANGES' : 'SAVE ROUTINE'}
          accessibilityLabel={saving ? 'Saving' : uncertain ? GYM_COPY.confirmSave : editing ? 'SAVE CHANGES' : 'SAVE ROUTINE'}
          disabled={!!problem}
          busy={saving}
          onPress={() => void save()}
        />
      )}>
      <Field
        label="Routine name"
        placeholder="e.g. Chest, Triceps, Shoulders"
        value={name}
        onChangeText={value => { setName(value); setTouched(true); }}
        onBlur={() => setTouched(true)}
        editable={!busy}
        error={touched ? problem ?? undefined : undefined}
        errorTestID="gym-routine-name-error"
      />
      <View>
        <Text style={[styles.label, { color: t['muted-flat'], fontFamily: fonts.display }]}>WEIGHT UNIT</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Weight unit" style={styles.row}>
          {UNITS.map(u => <Chip key={u} label={u} selected={unit === u} disabled={busy} onPress={() => setUnit(u)} />)}
        </View>
      </View>
    </EditorFrame>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, letterSpacing: 1.2, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8 },
});
