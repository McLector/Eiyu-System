import { useEffect, useRef, useState } from 'react';
import Dialog from '../components/Dialog';
import StatChip from '../components/StatChip';
import { useEditorGuard } from '../components/NavigationGuard';
import {
  CHAIN_ORDER_COPY,
  LongQuest,
  STAGE_DESCRIPTION_MAX_LENGTH,
  STATS,
  doneStagesFormPrefix,
  formatError,
  isStageDescriptionWithinLimit,
  normalizeNameBoundaries,
  validateQuestName,
  type Stat,
  UncertainSaveError,
  type ChainEditorInput,
} from '@eiyu/shared';
import { useEiyu } from '../store/eiyu-store';
import { TRACKER_MESSAGES } from '../store/tracker';
import { TrackerConsent } from './TrackerConsent';

interface DraftStage { id: string | null; name: string; description: string | null }

const MIN_STAGES = 1;
const stagesOf = (quest?: LongQuest): DraftStage[] =>
  quest ? quest.stages.map(s => ({ id: s.id, name: s.name, description: s.description })) : [{ id: null, name: '', description: null }, { id: null, name: '', description: null }];

/** Create (no quest) or edit (quest) a Long Quest inside the shared dialog. Mount it to open, unmount to close. */
export default function LongQuestEditorDialog({ quest, onClose }: { quest?: LongQuest; onClose: () => void }) {
  const { saveLongQuest, tracker, audience, acceptTracker, refreshTracker, user } = useEiyu();
  const editing = !!quest;
  // The live copy carries the current kind; the prop is only the chain as it was when the dialog opened.
  const live = quest ? user?.longQuests?.find(q => q.id === quest.id) ?? quest : null;
  const kind = live?.inputKind;
  const customOpen = !!tracker?.canWriteCustom;
  const readOnly = editing && (!tracker || !kind || (kind === 'custom' && !customOpen));
  const paused = !!tracker && !tracker.canWriteBasic;
  const [mode, setMode] = useState<'basic' | 'custom'>(() => (quest ? (quest.inputKind === 'basic' ? 'basic' : 'custom') : customOpen ? 'custom' : 'basic'));
  const customFields = mode === 'custom' && (customOpen || readOnly);
  const needsCustomNotice = mode === 'custom' && !customOpen && !readOnly;
  const alertRef = useRef<HTMLParagraphElement>(null);
  const [name, setName] = useState(quest?.name ?? '');
  const [stat, setStat] = useState<Stat>(quest?.stat ?? 'INT');
  const [description, setDescription] = useState(quest?.description ?? '');
  const [stages, setStages] = useState<DraftStage[]>(() => stagesOf(quest));
  // Absent (an older row, or migration 043 not applied) reads as in order, like a new chain.
  const [strictOrder, setStrictOrder] = useState(quest?.strictOrder !== false);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = editing
    ? mode !== (quest.inputKind === 'basic' ? 'basic' : 'custom') || name !== quest.name || stat !== quest.stat || description !== (quest.description ?? '') || strictOrder !== (quest.strictOrder !== false) || JSON.stringify(stages) !== JSON.stringify(stagesOf(quest))
    : mode !== (customOpen ? 'custom' : 'basic') || !!name || !!description || stat !== 'INT' || !strictOrder || stages.some(s => s.name || s.description);
  const guardedClose = useEditorGuard(dirty, saving || uncertain);

  // Shown only once the name has been typed in; an untouched form is incomplete, not wrong.
  const [nameTouched, setNameTouched] = useState(false);
  const nameProblem = editing && name === quest.name ? null : validateQuestName(name);
  const nameError = nameTouched ? nameProblem : null;
  const filled = stages.map(s => ({ ...s, name: s.name.trim() })).filter(s => s.name.length > 0);
  // Basic chains carry no text: a stage counts without a name, and the chain needs no name.
  const valid = !paused && (mode === 'basic'
    ? stages.length >= MIN_STAGES
    : customOpen && !nameProblem && filled.length >= MIN_STAGES);

  const setStageAt = (i: number, patch: Partial<DraftStage>) => setStages(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const isDone = (id: string | null) => !!quest?.stages.find(s => s.id === id)?.done;
  const removeStage = (i: number) => {
    if (stages.length <= MIN_STAGES || isDone(stages[i].id)) return;
    setStages(prev => prev.filter((_, idx) => idx !== i));
  };
  // Going back to in order needs the done stages to form a run from the start, judged on the draft (removing an open stage can fix a gap).
  const orderBlocked = !strictOrder && !doneStagesFormPrefix(stages.map(s => ({ done: isDone(s.id) })));

  const save = async () => {
    if (!valid || saving || readOnly) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === 'basic') {
        // Only the attribute, the order rule and the stage count (with existing ids) can travel with a basic save.
        const basic: ChainEditorInput = { mode: 'basic', values: { stat, strictOrder, stages: stages.map(s => (s.id ? { id: s.id } : {})) } };
        await (quest ? saveLongQuest(basic, quest.id) : saveLongQuest(basic));
        setUncertain(false);
        onClose();
        return;
      }
      const draft = {
        name: editing && name === quest.name ? name : normalizeNameBoundaries(name),
        stat,
        description: description.trim() || undefined,
        strictOrder,
        stages: editing
          ? filled.map(s => ({ id: s.id, name: s.name, description: s.description }))
          : filled.map(s => ({ name: s.name, description: s.description ?? '' })),
      };
      const custom: ChainEditorInput = { mode: 'custom', values: draft };
      await (quest ? saveLongQuest(custom, quest.id) : saveLongQuest(custom));
      setUncertain(false);
      onClose();
    } catch (err) {
      setUncertain(err instanceof UncertainSaveError);
      setError(`The System couldn't ${editing ? 'save that change' : 'create that quest'} — ${formatError(err)}`);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => { if (error) alertRef.current?.focus(); }, [error]);
  const errorId = 'long-quest-name-error';
  return (
    <Dialog title={editing ? 'Edit Long Quest' : 'New Long Quest'} pending={saving} initialFocus='input[aria-label="Quest name"]' onClose={() => guardedClose(onClose)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {readOnly && (
          <div role="group" aria-label="Read-only quest">
            <p>{tracker ? TRACKER_MESSAGES.readOnly : 'Tracker access is unavailable, so this chain is read-only for now.'}</p>
            {tracker && kind && !customOpen && <TrackerConsent userId={tracker.revision.userId} access={tracker} purpose="custom-tracker" mode="prompt" audience={audience} declineLabel="Keep read-only"
              onDecline={() => guardedClose(onClose)} onChanged={acceptTracker} onStale={() => void refreshTracker()} />}
          </div>
        )}
        {!readOnly && (!editing || kind === 'basic') && (
          <div role="group" aria-label="Tracking style">
            <span className="field-label">TRACKING</span>
            <div className="seg">
              <button type="button" className="choice-chip" aria-pressed={mode === 'basic'} disabled={saving || uncertain} onClick={() => setMode('basic')}>Use basic tracking</button>
              <button type="button" className="choice-chip" aria-pressed={mode === 'custom'} disabled={saving || uncertain} onClick={() => setMode('custom')}>Use custom details</button>
            </div>
          </div>
        )}
        {mode === 'basic' && !readOnly && (
          <p className="field-hint">Basic chains get neutral names from the System, such as &quot;Chain 1&quot; and &quot;Stage 1&quot;. You still choose the attribute, the stage order and how many stages.{editing ? ' Adding custom details later cannot be undone.' : ''}</p>
        )}
        {needsCustomNotice && tracker && (
          <TrackerConsent userId={tracker.revision.userId} access={tracker} purpose="custom-tracker" mode="prompt" audience={audience} declineLabel="Keep basic tracking"
            onDecline={() => setMode('basic')} onChanged={acceptTracker} onStale={() => void refreshTracker()} />
        )}
        {needsCustomNotice && !tracker && <p role="alert">Tracker access is unavailable. Use basic tracking or try again later.</p>}
        {paused && <p className="field-hint">{TRACKER_MESSAGES.paused}</p>}
        {(customFields || mode === 'basic') && <fieldset disabled={saving || uncertain || readOnly} className="editor-fields">
          {customFields && <input aria-label="Quest name" aria-invalid={!!nameError} aria-describedby={nameError ? errorId : undefined} className="field" placeholder="Quest name..." value={name} onChange={e => { setName(e.target.value); setNameTouched(true); }} />}
          {customFields && nameError && <p id={errorId} role="alert" aria-live="polite" className="phase4-error" style={{ margin: 0 }}>{nameError}</p>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATS.map(s => <StatChip key={s} stat={s} selected={stat === s} onClick={() => setStat(s)} />)}
          </div>
          {customFields && <textarea className="field" placeholder="Note (optional) — context, why it matters..." value={description} onChange={e => setDescription(e.target.value)} rows={2} />}
          <div>
            <label className="gym-checkbox"><input type="checkbox" checked={strictOrder} disabled={orderBlocked} aria-describedby="long-quest-order-hint" onChange={e => setStrictOrder(e.target.checked)} />{CHAIN_ORDER_COPY.label}</label>
            <p id="long-quest-order-hint" className="field-hint">{orderBlocked ? CHAIN_ORDER_COPY.blocked : strictOrder ? CHAIN_ORDER_COPY.hintOn : CHAIN_ORDER_COPY.hintOff}</p>
          </div>
          <div className="field-label" style={{ marginBottom: 0 }}>STAGES</div>
          {stages.map((st, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 6, minWidth: 0 }}>
                {mode === 'basic' ? <span className="field" aria-live="off">{`Stage ${i + 1}`}</span> : <>
                <input className="field" placeholder={`Stage ${i + 1}...`} value={st.name} onChange={e => setStageAt(i, { name: e.target.value })} />
                <textarea
                  className="field"
                  placeholder="Stage description (optional)"
                  value={st.description ?? ''}
                  onChange={e => { if (isStageDescriptionWithinLimit(e.target.value)) setStageAt(i, { description: e.target.value }); }}
                  aria-label={`Stage ${i + 1} description. Maximum ${STAGE_DESCRIPTION_MAX_LENGTH} characters.`}
                  rows={2}
                />
                </>}
              </div>
              {(editing || mode === 'basic') && stages.length > MIN_STAGES && (
                <button type="button" aria-label={`Remove stage ${i + 1}`} className="phase4-close" disabled={isDone(st.id)} onClick={() => removeStage(i)}>×</button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setStages([...stages, { id: null, name: '', description: null }])} className="btn-secondary">+ Add stage</button>
        </fieldset>}
        {error && <p role="alert" tabIndex={-1} ref={alertRef} className="phase4-error">{error}</p>}
        <div className="action-footer">
          <button type="button" onClick={() => guardedClose(onClose)} disabled={saving} className="btn-secondary">{readOnly ? 'Close' : 'Cancel'}</button>
          {!readOnly && <button type="button" onClick={() => void save()} disabled={!valid || saving} className="btn-primary">
            {saving ? 'SAVING…' : uncertain ? 'CHECK SAVE RESULT' : editing ? 'SAVE CHANGES' : 'CREATE'}
          </button>}
        </div>
      </div>
    </Dialog>
  );
}
