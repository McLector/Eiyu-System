import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  deleteGymMedia,
  formatError,
  GYM_COPY,
  newRequestId,
  normalizeGymExercise,
  parseGymRir,
  saveGymExercise,
  UncertainSaveError,
  type GymMediaMime,
} from '@eiyu/shared';

import { UploadIcon } from '@/components/eiyu/icons';
import { EditorFrame } from '@/components/gym/editor-frame';
import { MediaView } from '@/components/gym/exercise-media';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { StateBlock } from '@/components/ui/state-block';
import { fonts } from '@/constants/eiyu-theme';
import { useGym } from '@/contexts/gym-store';
import { useTokens } from '@/contexts/theme-store';
import { pickGymMedia, uploadPickedGymMedia, type PickedGymMedia } from '@/lib/gym-media-upload';
import { hapticSuccess } from '@/lib/haptics';

export default function GymExerciseEditorScreen() {
  const t = useTokens();
  const gym = useGym();
  const { routineId, id } = useLocalSearchParams<{ routineId?: string; id?: string }>();
  const exercise = id ? gym.exercises.find(e => e.id === id) ?? null : null;
  const editing = exercise !== null;

  const [initial] = useState(() => ({
    name: exercise?.name ?? '',
    sets: String(exercise?.sets ?? 3),
    reps: exercise?.reps ?? '6-10',
    rest_seconds: String(exercise?.rest_seconds ?? 150),
    rir: exercise?.rir_max ? `${exercise.rir}-${exercise.rir_max}` : String(exercise?.rir ?? 2),
    notes: exercise?.notes ?? '',
  }));
  const [form, setForm] = useState(initial);
  const [picked, setPicked] = useState<PickedGymMedia | null>(null);
  const [removeMedia, setRemoveMedia] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const committed = useRef(false);
  /** Made once: a retry of an unconfirmed create is the same exercise, not a second one. */
  const [creationId] = useState(() => exercise?.id ?? newRequestId());
  /** The file already uploaded for this save, kept so a retry does not upload it again. */
  const uploaded = useRef<{ path: string; mime: GymMediaMime } | null>(null);
  const busy = saving || uncertain;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || picked !== null || removeMedia;
  const field = (key: keyof typeof initial, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const choose = async () => {
    setError(null);
    try {
      const media = await pickGymMedia();
      if (!media) return;
      setPicked(media);
      uploaded.current = null;
      setRemoveMedia(false);
    } catch (err) {
      setError(formatError(err));
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    let held = false;
    let landed = false;
    try {
      if (!form.sets.trim() || !form.rest_seconds.trim()) throw new Error('Sets and rest are required.');
      const normalized = normalizeGymExercise({ name: form.name, reps: form.reps, notes: form.notes, sets: Number(form.sets), rest_seconds: Number(form.rest_seconds), ...parseGymRir(form.rir) });
      let path = removeMedia ? null : exercise?.media_path ?? null;
      let mime = removeMedia ? null : exercise?.media_mime ?? null;
      if (picked) {
        const media = uploaded.current ?? await uploadPickedGymMedia(gym.userId!, routineId!, picked);
        uploaded.current = media;
        held = true;
        path = media.path;
        mime = media.mime;
      }
      const nextPosition = Math.max(-1, ...gym.exercises.map(e => e.position)) + 1;
      await saveGymExercise({ ...normalized, id: creationId, user_id: gym.userId!, routine_id: routineId!, position: exercise?.position ?? nextPosition, media_path: path, media_mime: mime });
      landed = true;
      let warning: string | undefined;
      if (exercise?.media_path && exercise.media_path !== path) {
        try { await deleteGymMedia(exercise.media_path); } catch (err) { warning = `Exercise saved. Previous media cleanup failed: ${formatError(err)}`; }
      }
      setUncertain(false);
      hapticSuccess();
      committed.current = true;
      router.back();
      await (warning ? gym.refreshAfterSave('Exercise', undefined, warning) : gym.refreshAfterSave('Exercise'));
    } catch (err) {
      setUncertain(err instanceof UncertainSaveError);
      setError(held && !landed ? `${formatError(err)} ${GYM_COPY.uploadHeld}` : formatError(err));
    } finally {
      setSaving(false);
    }
  };

  const frame = { closeLabel: 'Close exercise editor', testID: 'gym-exercise-editor', onClose: () => router.back() };
  if ((id && !exercise) || !routineId) {
    return (
      <EditorFrame {...frame} title="EDIT EXERCISE" dirty={false} busy={false} uncertain={false} committed={committed} discardMessage="" onLeaveUnconfirmed={() => {}} footer={null}>
        <StateBlock kind="empty" title="EXERCISE NOT FOUND">This exercise was removed or is no longer available.</StateBlock>
      </EditorFrame>
    );
  }

  const label = saving ? 'SAVING…' : uncertain ? GYM_COPY.confirmSave : editing ? 'SAVE CHANGES' : 'SAVE EXERCISE';
  const hasName = form.name.trim().length > 0;
  return (
    <EditorFrame
      {...frame}
      title={editing ? 'EDIT EXERCISE' : 'ADD EXERCISE'}
      dirty={dirty}
      busy={busy}
      uncertain={uncertain && !saving}
      committed={committed}
      discardMessage="Your unsaved exercise changes will be lost."
      onLeaveUnconfirmed={gym.retryLoad}
      error={error}
      footer={<Button testID="gym-exercise-save" variant="primary" label={label} accessibilityLabel={saving ? 'Saving' : label} disabled={!hasName} busy={saving} onPress={() => void save()} />}>
      <View style={styles.media}>
        <Text style={[styles.label, { color: t['muted-flat'], fontFamily: fonts.display }]}>DEMONSTRATION (OPTIONAL)</Text>
        {picked ? (
          <>
            <Text style={[styles.fileName, { color: t.text, fontFamily: fonts.mono }]}>{picked.name}</Text>
            <MediaView url={picked.uri} mime={picked.mime} label="Selected demonstration" />
            <Button variant="quiet" label="Remove selected file" disabled={busy} onPress={() => { setPicked(null); uploaded.current = null; }} />
          </>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose GIF or MP4"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => void choose()}
          style={[styles.drop, { borderColor: t['accent-border'], backgroundColor: t['accent-glass'] }, busy && styles.dim]}>
          <UploadIcon size={24} color={t['accent-text']} />
          <Text style={[styles.dropTitle, { color: t['accent-text'], fontFamily: fonts.display }]}>{picked ? 'Choose another file' : 'Add a demo video or GIF'}</Text>
          <Text style={[styles.dropHint, { color: t['muted-flat'], fontFamily: fonts.body }]}>Optional · GIF or MP4, up to 20 MiB. You can replay it from the exercise card any time.</Text>
        </Pressable>
        {exercise?.media_path ? (
          <View style={styles.row}>
            <Chip kind="checkbox" label="Remove current demonstration" selected={removeMedia} disabled={busy} onPress={() => { setRemoveMedia(v => !v); setPicked(null); uploaded.current = null; }} />
          </View>
        ) : null}
      </View>

      <Field testID="gym-exercise-name" label="Exercise name" value={form.name} onChangeText={value => field('name', value)} editable={!busy} />
      <View style={styles.pair}>
        <View style={styles.half}><Field label="Sets" keyboardType="number-pad" value={form.sets} onChangeText={value => field('sets', value)} editable={!busy} /></View>
        <View style={styles.half}><Field testID="gym-exercise-reps" label="Reps or range" placeholder="8–12" value={form.reps} onChangeText={value => field('reps', value)} editable={!busy} /></View>
      </View>
      <View style={styles.pair}>
        <View style={styles.half}><Field label="Rest (seconds)" keyboardType="number-pad" value={form.rest_seconds} onChangeText={value => field('rest_seconds', value)} editable={!busy} /></View>
        <View style={styles.half}><Field label="RIR" placeholder="1-2" value={form.rir} onChangeText={value => field('rir', value)} editable={!busy} /></View>
      </View>
      <Field label="Notes" value={form.notes} onChangeText={value => field('notes', value)} editable={!busy} multiline />
    </EditorFrame>
  );
}

const styles = StyleSheet.create({
  media: { gap: 8 },
  label: { fontSize: 11, letterSpacing: 1.2 },
  fileName: { fontSize: 12 },
  drop: { minHeight: 96, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 8, paddingVertical: 16, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dropTitle: { fontSize: 16, letterSpacing: 0.8, textTransform: 'uppercase' },
  dropHint: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  dim: { opacity: 0.5 },
  row: { flexDirection: 'row' },
  pair: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
});
