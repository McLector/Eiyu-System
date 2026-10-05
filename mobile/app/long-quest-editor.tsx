import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatError,
  isStageDescriptionWithinLimit,
  NAVIGATION_GUARD_COPY,
  normalizeNameBoundaries,
  STAGE_DESCRIPTION_MAX_LENGTH,
  STATS,
  UncertainSaveError,
  validateQuestName,
  type Stat,
} from '@eiyu/shared';

import { PlusIcon } from '@/components/eiyu/icons';
import { Button } from '@/components/ui/button';
import { DiscardChangesModal } from '@/components/ui/discard-changes-modal';
import { Field } from '@/components/ui/field';
import { StatChip } from '@/components/ui/stat-chip';
import { StateBlock } from '@/components/ui/state-block';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import { useTokens } from '@/contexts/theme-store';
import { hapticSuccess } from '@/lib/haptics';

const MIN_STAGES = 1;

type StageField = { id: string | null; name: string; description: string | null };
const blankStage = (): StageField => ({ id: null, name: '', description: null });

export default function LongQuestEditorScreen() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, saveLongQuest, forgetLongQuestSave, retryLongQuests } = useEiyu();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const quest = id ? user.longQuests.find(q => q.id === id) ?? null : null;

  const [name, setName] = useState(quest?.name ?? '');
  const [nameTouched, setNameTouched] = useState(false);
  const [stat, setStat] = useState<Stat>(quest?.stat ?? 'INT');
  const [description, setDescription] = useState(quest?.description ?? '');
  const [stages, setStages] = useState<StageField[]>(
    quest ? quest.stages.map(s => ({ id: s.id, name: s.name, description: s.description })) : [blankStage(), blankStage()]
  );
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leavePrompt, setLeavePrompt] = useState<'discard' | 'busy' | null>(null);
  const committed = useRef(false);
  const heldAction = useRef<unknown>(null);
  const busy = saving || uncertain;

  const snapshot = () => JSON.stringify({ name, stat, description, stages });
  const [initialSnapshot] = useState(snapshot);
  const dirty = snapshot() !== initialSnapshot;

  // Leaving (Back, swipe, the close button) with unsaved edits asks first; a save that is running or unconfirmed
  // blocks leaving instead; a finished save does neither.
  useEffect(() => navigation.addListener('beforeRemove', event => {
    if (committed.current || (!dirty && !busy)) return;
    event.preventDefault();
    heldAction.current = event.data.action;
    setLeavePrompt(busy ? 'busy' : 'discard');
  }), [navigation, dirty, busy]);

  const release = () => {
    committed.current = true;
    setLeavePrompt(null);
    navigation.dispatch(heldAction.current as Parameters<typeof navigation.dispatch>[0]);
  };
  // The save may or may not have landed. Drop the remembered ids (a later create starts clean) and refresh the list so
  // the answer shows up there.
  const leaveUnconfirmed = () => {
    forgetLongQuestSave();
    void retryLongQuests();
    release();
  };

  const editing = quest !== null;
  const nameProblem = editing && name === quest.name ? null : validateQuestName(name);
  const nameError = nameTouched ? nameProblem : null;
  const filled = stages.map(s => ({ ...s, name: s.name.trim() })).filter(s => s.name.length > 0);
  const valid = !nameProblem && filled.length >= MIN_STAGES;
  const isDone = (stageId: string | null) => !!quest?.stages.find(s => s.id === stageId)?.done;

  const setStageAt = (i: number, patch: Partial<StageField>) => setStages(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const removeStage = (i: number) => {
    if (stages.length <= MIN_STAGES || isDone(stages[i].id)) return;
    setStages(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveLongQuest(
        {
          name: editing && name === quest.name ? name : normalizeNameBoundaries(name),
          stat,
          description: description.trim() || undefined,
          stages: filled.map(s => ({ id: s.id, name: s.name, description: s.description })),
        },
        quest?.id
      );
      setUncertain(false);
      hapticSuccess();
      committed.current = true;
      router.back();
    } catch (err) {
      setUncertain(err instanceof UncertainSaveError);
      setError(`The System couldn't ${editing ? 'save that change' : 'create that quest'} — ${formatError(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const close = () => router.back();
  const closeButton = (
    <Pressable
      testID="long-quest-editor-close"
      accessibilityRole="button"
      accessibilityLabel="Close long quest editor"
      onPress={close}
      style={styles.close}>
      <View style={styles.closeGlyph}><PlusIcon size={22} color={t['muted-flat']} /></View>
    </Pressable>
  );

  if (id && !quest) {
    return (
      <View style={[styles.root, { backgroundColor: t['page-flat'] }]}>
        <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: t['divider-flat'] }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>EDIT LONG QUEST</Text>
          {closeButton}
        </View>
        <StateBlock kind="empty" title="CHAIN NOT FOUND">This chain was deleted or is no longer available.</StateBlock>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.root, { backgroundColor: t['page-flat'] }]}>
      <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: t['divider-flat'] }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>
          {editing ? 'EDIT LONG QUEST' : 'NEW LONG QUEST'}
        </Text>
        {closeButton}
      </View>

      <View testID="long-quest-editor-form" style={styles.form}>
        <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}>
          <Field
            label="Quest name"
            placeholder="e.g. Ship a Side Project"
            value={name}
            onChangeText={value => { setName(value); setNameTouched(true); }}
            onBlur={() => setNameTouched(true)}
            editable={!busy}
            error={nameError ?? undefined}
            errorTestID="long-quest-name-error"
          />

          <View>
            <Text style={[styles.label, { color: t['muted-flat'], fontFamily: fonts.display }]}>STAT</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Stat" style={styles.row}>
              {STATS.map(s => <StatChip key={s} stat={s} selected={stat === s} disabled={busy} onPress={() => setStat(s)} />)}
            </View>
          </View>

          <Field
            label="Note"
            placeholder="Context, why it matters…"
            value={description}
            onChangeText={setDescription}
            editable={!busy}
            multiline
          />

          <View style={styles.stages}>
            <Text style={[styles.label, { color: t['muted-flat'], fontFamily: fonts.display }]}>STAGES (IN ORDER)</Text>
            {stages.map((s, i) => {
              const done = isDone(s.id);
              const canRemove = stages.length > MIN_STAGES;
              return (
                <View key={i} style={styles.stage}>
                  <View style={styles.stageFields}>
                    <Field
                      testID={`long-quest-stage-name-${i + 1}`}
                      label={`Stage ${i + 1}`}
                      accessibilityLabel={`Stage ${i + 1}: ${s.name || 'empty'}`}
                      placeholder={`Stage ${i + 1}`}
                      value={s.name}
                      onChangeText={value => setStageAt(i, { name: value })}
                      editable={!busy}
                      hint={done ? 'Done stages stay in the chain.' : undefined}
                    />
                    <Field
                      label={`Stage ${i + 1} description (optional)`}
                      placeholder="Stage description (optional)"
                      value={s.description ?? ''}
                      onChangeText={value => { if (isStageDescriptionWithinLimit(value)) setStageAt(i, { description: value }); }}
                      accessibilityHint={`Maximum ${STAGE_DESCRIPTION_MAX_LENGTH} characters`}
                      editable={!busy}
                      multiline
                    />
                  </View>
                  {canRemove ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove stage ${i + 1}`}
                      accessibilityState={{ disabled: busy || done }}
                      disabled={busy || done}
                      onPress={() => removeStage(i)}
                      style={[styles.remove, (busy || done) && styles.dimmed]}>
                      <View style={styles.closeGlyph}><PlusIcon size={20} color={t['muted-flat']} /></View>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
            <Button
              variant="secondary"
              label="ADD STAGE"
              icon={<PlusIcon size={16} color={t['accent-text']} />}
              disabled={busy}
              onPress={() => setStages(prev => [...prev, blankStage()])}
            />
          </View>
        </KeyboardAwareScrollView>
      </View>

      <View testID="long-quest-editor-footer" style={[styles.footer, { borderTopColor: t['divider-flat'], paddingBottom: Math.max(12, insets.bottom) }]}>
        {error ? <Text accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>{error}</Text> : null}
        <Button
          testID="long-quest-save"
          variant="primary"
          label={saving ? 'SAVING…' : uncertain ? 'CHECK SAVE RESULT' : editing ? 'SAVE CHANGES' : 'CREATE LONG QUEST'}
          accessibilityLabel={saving ? 'Saving' : uncertain ? 'CHECK SAVE RESULT' : editing ? 'SAVE CHANGES' : 'CREATE LONG QUEST'}
          disabled={!valid}
          busy={saving}
          onPress={() => void handleSave()}
        />
      </View>

      <DiscardChangesModal
        visible={leavePrompt === 'discard'}
        testID="long-quest-discard-modal"
        message="Your unsaved long quest changes will be lost."
        onKeep={() => setLeavePrompt(null)}
        onDiscard={release}
      />
      <Modal testID="long-quest-busy-modal" visible={leavePrompt === 'busy'} transparent animationType="fade" onRequestClose={() => setLeavePrompt(null)}>
        <View style={[styles.overlay, { backgroundColor: t.overlay }]} accessibilityViewIsModal>
          <View style={[styles.dialog, { backgroundColor: t.modal, borderColor: t['accent-border'] }]}>
            <Text accessibilityRole="header" style={[styles.dialogTitle, { color: t.text, fontFamily: fonts.display }]}>{NAVIGATION_GUARD_COPY.busyTitle}</Text>
            <Text style={[styles.dialogText, { color: t['muted-flat'], fontFamily: fonts.body }]}>{NAVIGATION_GUARD_COPY.busyBody}</Text>
            <View style={styles.dialogActions}>
              {uncertain && !saving ? <Button variant="quiet" label="Leave without confirming" onPress={leaveUnconfirmed} /> : null}
              <Button variant="secondary" label="Stay" onPress={() => setLeavePrompt(null)} />
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 4, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, fontSize: 20, letterSpacing: 1 },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  closeGlyph: { transform: [{ rotate: '45deg' }] },
  form: { flex: 1 },
  formContent: { padding: 20, gap: 18 },
  label: { fontSize: 11, letterSpacing: 1.2, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8 },
  stages: { gap: 12 },
  stage: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  stageFields: { flex: 1, gap: 8 },
  remove: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.45 },
  note: { fontSize: 12, lineHeight: 17 },
  footer: { flexShrink: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  overlay: { flex: 1, justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 480, alignSelf: 'center', borderWidth: 1, borderRadius: 4, padding: 20, gap: 10 },
  dialogTitle: { fontSize: 18, letterSpacing: 0.8 },
  dialogText: { fontSize: 14, lineHeight: 21 },
  dialogActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
});
