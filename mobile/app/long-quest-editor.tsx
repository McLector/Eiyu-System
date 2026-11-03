import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { KeyboardAvoidingView, KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CHAIN_ORDER_COPY,
  doneStagesFormPrefix,
  formatError,
  isStageDescriptionWithinLimit,
  NAVIGATION_GUARD_COPY,
  normalizeNameBoundaries,
  STAGE_DESCRIPTION_MAX_LENGTH,
  STATS,
  UncertainSaveError,
  validateQuestName,
  type ChainEditorInput,
  type Stat,
} from '@eiyu/shared';

import { PlusIcon } from '@/components/eiyu/icons';
import { TrackerConsent } from '@/components/status/tracker-consent';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { DiscardChangesModal } from '@/components/ui/discard-changes-modal';
import { Field } from '@/components/ui/field';
import { StatChip } from '@/components/ui/stat-chip';
import { StateBlock } from '@/components/ui/state-block';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';
import { TRACKER_MESSAGES } from '@/contexts/tracker-access';
import { useTokens } from '@/contexts/theme-store';
import { hapticSuccess } from '@/lib/haptics';

const MIN_STAGES = 1;

type StageField = { id: string | null; name: string; description: string | null };
const blankStage = (): StageField => ({ id: null, name: '', description: null });

export default function LongQuestEditorScreen() {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, saveLongQuest, forgetLongQuestSave, retryLongQuests, tracker, audience, acceptTracker, refreshTracker } = useEiyu();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const quest = id ? user.longQuests.find(q => q.id === id) ?? null : null;

  // The live copy carries the current kind. A chain is read-only when it is unclassified, or custom without custom
  // permission, or access has not loaded; nothing about it can then be saved from here.
  const kind = quest?.inputKind;
  const customOpen = !!tracker?.canWriteCustom;
  const readOnly = quest !== null && (!tracker || !kind || (kind === 'custom' && !customOpen));
  const paused = !!tracker && !tracker.canWriteBasic;
  const [mode, setMode] = useState<'basic' | 'custom'>(() => (quest ? (quest.inputKind === 'basic' ? 'basic' : 'custom') : customOpen ? 'custom' : 'basic'));
  const customFields = mode === 'custom' && (customOpen || readOnly);
  const needsCustomNotice = mode === 'custom' && !customOpen && !readOnly;

  const [name, setName] = useState(quest?.name ?? '');
  const [nameTouched, setNameTouched] = useState(false);
  const [stat, setStat] = useState<Stat>(quest?.stat ?? 'INT');
  const [description, setDescription] = useState(quest?.description ?? '');
  const [stages, setStages] = useState<StageField[]>(
    quest ? quest.stages.map(s => ({ id: s.id, name: s.name, description: s.description })) : [blankStage(), blankStage()]
  );
  // Absent (an older row, or migration 043 not applied) reads as in order, like a new chain.
  const [strictOrder, setStrictOrder] = useState(quest?.strictOrder !== false);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leavePrompt, setLeavePrompt] = useState<'discard' | 'busy' | null>(null);
  const committed = useRef(false);
  const heldAction = useRef<unknown>(null);
  const busy = saving || uncertain;
  const locked = busy || readOnly;

  const snapshot = () => JSON.stringify({ mode, name, stat, description, stages, strictOrder });
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
  // Basic chains carry no text: a stage counts without a name, and the chain needs no name.
  const valid = !!tracker && !paused && (mode === 'basic'
    ? stages.length >= MIN_STAGES
    : customOpen && !nameProblem && filled.length >= MIN_STAGES);
  const isDone = (stageId: string | null) => !!quest?.stages.find(s => s.id === stageId)?.done;
  // Going back to in order needs the done stages to form a run from the start, judged on the draft (removing an open stage can fix a gap).
  const orderBlocked = !strictOrder && !doneStagesFormPrefix(stages.map(s => ({ done: isDone(s.id) })));

  const setStageAt = (i: number, patch: Partial<StageField>) => setStages(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const removeStage = (i: number) => {
    if (stages.length <= MIN_STAGES || isDone(stages[i].id)) return;
    setStages(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    if (!valid || saving || readOnly) return;
    setSaving(true);
    setError(null);
    try {
      // A basic save carries only the attribute, the order rule and the stages' existing ids: no typed text can travel.
      const editor: ChainEditorInput = mode === 'basic'
        ? { mode: 'basic', values: { stat, strictOrder, stages: stages.map(s => (s.id ? { id: s.id } : {})) } }
        : {
          mode: 'custom',
          values: {
            name: editing && name === quest.name ? name : normalizeNameBoundaries(name),
            stat,
            description: description.trim() || undefined,
            strictOrder,
            stages: filled.map(s => ({ id: s.id, name: s.name, description: s.description })),
          },
        };
      await saveLongQuest(editor, quest?.id);
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
          <AppText accessibilityRole="header" style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>EDIT LONG QUEST</AppText>
          {closeButton}
        </View>
        <StateBlock kind="empty" title="CHAIN NOT FOUND">This chain was deleted or is no longer available.</StateBlock>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.root, { backgroundColor: t['page-flat'] }]}>
      <View style={[styles.header, { paddingTop: insets.top, borderBottomColor: t['divider-flat'] }]}>
        <AppText accessibilityRole="header" style={[styles.title, { color: t.text, fontFamily: fonts.display }]}>
          {editing ? 'EDIT LONG QUEST' : 'NEW LONG QUEST'}
        </AppText>
        {closeButton}
      </View>

      <View testID="long-quest-editor-form" style={styles.form}>
        <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}>
          {readOnly ? (
            <View accessibilityLabel="Read-only quest" style={styles.notice}>
              <AppText style={[styles.note, { color: t['muted-flat'], fontFamily: fonts.body }]}>
                {tracker ? TRACKER_MESSAGES.readOnly : 'Tracker access is unavailable, so this chain is read-only for now.'}
              </AppText>
              {tracker && kind && !customOpen ? (
                <TrackerConsent userId={tracker.revision.userId} access={tracker} purpose="custom-tracker" mode="prompt" audience={audience} declineLabel="Keep read-only"
                  onDecline={close} onChanged={acceptTracker} onStale={() => void refreshTracker()} />
              ) : null}
            </View>
          ) : null}

          {!readOnly && (!editing || kind === 'basic') ? (
            <View accessibilityLabel="Tracking style">
              <AppText style={[styles.label, { color: t['muted-flat'], fontFamily: fonts.display }]}>TRACKING</AppText>
              <View style={styles.row}>
                <Chip label="Use basic tracking" selected={mode === 'basic'} disabled={busy} onPress={() => setMode('basic')} />
                <Chip label="Use custom details" selected={mode === 'custom'} disabled={busy} onPress={() => setMode('custom')} />
              </View>
            </View>
          ) : null}

          {mode === 'basic' && !readOnly ? (
            <AppText style={[styles.note, { color: t['dim-flat'], fontFamily: fonts.body }]}>
              Basic chains get neutral names from the System, such as &quot;Chain 1&quot; and &quot;Stage 1&quot;. You still choose the attribute, the stage order and how many stages.
              {editing ? ' Adding custom details later cannot be undone.' : ''}
            </AppText>
          ) : null}

          {needsCustomNotice && tracker ? (
            <TrackerConsent userId={tracker.revision.userId} access={tracker} purpose="custom-tracker" mode="prompt" audience={audience} declineLabel="Keep basic tracking"
              onDecline={() => setMode('basic')} onChanged={acceptTracker} onStale={() => void refreshTracker()} />
          ) : null}
          {needsCustomNotice && !tracker ? (
            <AppText accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>Tracker access is unavailable. Use basic tracking or try again later.</AppText>
          ) : null}
          {paused ? <AppText style={[styles.note, { color: t['dim-flat'], fontFamily: fonts.body }]}>{TRACKER_MESSAGES.paused}</AppText> : null}

          {customFields ? (
            <Field
              label="Quest name"
              placeholder="e.g. Ship a Side Project"
              value={name}
              onChangeText={value => { setName(value); setNameTouched(true); }}
              onBlur={() => setNameTouched(true)}
              editable={!locked}
              error={nameError ?? undefined}
              errorTestID="long-quest-name-error"
            />
          ) : null}

          <View>
            <AppText style={[styles.label, { color: t['muted-flat'], fontFamily: fonts.display }]}>STAT</AppText>
            <View accessibilityRole="radiogroup" accessibilityLabel="Stat" style={styles.row}>
              {STATS.map(s => <StatChip key={s} stat={s} selected={stat === s} disabled={locked} onPress={() => setStat(s)} />)}
            </View>
          </View>

          {customFields ? (
            <Field
              label="Note"
              placeholder="Context, why it matters…"
              value={description}
              onChangeText={setDescription}
              editable={!locked}
              multiline
            />
          ) : null}

          <View style={styles.orderOption}>
            <Chip kind="checkbox" label={CHAIN_ORDER_COPY.label} selected={strictOrder} disabled={locked || orderBlocked} onPress={() => setStrictOrder(v => !v)} />
            <AppText style={[styles.note, { color: t['dim-flat'], fontFamily: fonts.body }]}>
              {orderBlocked ? CHAIN_ORDER_COPY.blocked : strictOrder ? CHAIN_ORDER_COPY.hintOn : CHAIN_ORDER_COPY.hintOff}
            </AppText>
          </View>

          <View style={styles.stages}>
            <AppText style={[styles.label, { color: t['muted-flat'], fontFamily: fonts.display }]}>{strictOrder ? 'STAGES (IN ORDER)' : 'STAGES (ANY ORDER)'}</AppText>
            {stages.map((s, i) => {
              const done = isDone(s.id);
              const canRemove = stages.length > MIN_STAGES;
              return (
                <View key={i} style={styles.stage}>
                  {mode === 'basic' ? (
                    <View style={styles.stageFields}>
                      <AppText style={[styles.note, { color: t.text, fontFamily: fonts.body, fontSize: 15, minHeight: 48, textAlignVertical: 'center' }]}>{`Stage ${i + 1}`}</AppText>
                    </View>
                  ) : (
                  <View style={styles.stageFields}>
                    <Field
                      testID={`long-quest-stage-name-${i + 1}`}
                      label={`Stage ${i + 1}`}
                      accessibilityLabel={`Stage ${i + 1}: ${s.name || 'empty'}`}
                      placeholder={`Stage ${i + 1}`}
                      value={s.name}
                      onChangeText={value => setStageAt(i, { name: value })}
                      editable={!locked}
                      hint={done ? 'Done stages stay in the chain.' : undefined}
                    />
                    <Field
                      label={`Stage ${i + 1} description (optional)`}
                      placeholder="Stage description (optional)"
                      value={s.description ?? ''}
                      onChangeText={value => { if (isStageDescriptionWithinLimit(value)) setStageAt(i, { description: value }); }}
                      accessibilityHint={`Maximum ${STAGE_DESCRIPTION_MAX_LENGTH} characters`}
                      editable={!locked}
                      multiline
                    />
                  </View>
                  )}
                  {canRemove ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove stage ${i + 1}`}
                      accessibilityState={{ disabled: locked || done }}
                      disabled={locked || done}
                      onPress={() => removeStage(i)}
                      style={[styles.remove, (locked || done) && styles.dimmed]}>
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
              disabled={locked}
              onPress={() => setStages(prev => [...prev, blankStage()])}
            />
          </View>
        </KeyboardAwareScrollView>
      </View>

      <View testID="long-quest-editor-footer" style={[styles.footer, { borderTopColor: t['divider-flat'], paddingBottom: Math.max(12, insets.bottom) }]}>
        {error ? <AppText accessibilityRole="alert" style={[styles.note, { color: t.danger, fontFamily: fonts.body }]}>{error}</AppText> : null}
        {readOnly ? null : <Button
          testID="long-quest-save"
          variant="primary"
          label={saving ? 'SAVING…' : uncertain ? 'CHECK SAVE RESULT' : editing ? 'SAVE CHANGES' : 'CREATE LONG QUEST'}
          accessibilityLabel={saving ? 'Saving' : uncertain ? 'CHECK SAVE RESULT' : editing ? 'SAVE CHANGES' : 'CREATE LONG QUEST'}
          disabled={!valid}
          busy={saving}
          onPress={() => void handleSave()}
        />}
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
            <AppText accessibilityRole="header" style={[styles.dialogTitle, { color: t.text, fontFamily: fonts.display }]}>{NAVIGATION_GUARD_COPY.busyTitle}</AppText>
            <AppText style={[styles.dialogText, { color: t['muted-flat'], fontFamily: fonts.body }]}>{NAVIGATION_GUARD_COPY.busyBody}</AppText>
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
  orderOption: { gap: 6, alignItems: 'flex-start' },
  stages: { gap: 12 },
  stage: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  stageFields: { flex: 1, gap: 8 },
  remove: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.45 },
  note: { fontSize: 12, lineHeight: 17 },
  notice: { gap: 8 },
  footer: { flexShrink: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  overlay: { flex: 1, justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 480, alignSelf: 'center', borderWidth: 1, borderRadius: 4, padding: 20, gap: 10 },
  dialogTitle: { fontSize: 18, letterSpacing: 0.8 },
  dialogText: { fontSize: 14, lineHeight: 21 },
  dialogActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
});
