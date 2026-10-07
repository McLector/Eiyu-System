import { useState } from 'react';
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
} from '@eiyu/shared';
import { useEiyu } from '../store/eiyu-store';

interface DraftStage { id: string | null; name: string; description: string | null }

const MIN_STAGES = 1;
const stagesOf = (quest?: LongQuest): DraftStage[] =>
  quest ? quest.stages.map(s => ({ id: s.id, name: s.name, description: s.description })) : [{ id: null, name: '', description: null }, { id: null, name: '', description: null }];

/** Create (no quest) or edit (quest) a Long Quest inside the shared dialog. Mount it to open, unmount to close. */
export default function LongQuestEditorDialog({ quest, onClose }: { quest?: LongQuest; onClose: () => void }) {
  const { saveLongQuest } = useEiyu();
  const editing = !!quest;
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
    ? name !== quest.name || stat !== quest.stat || description !== (quest.description ?? '') || strictOrder !== (quest.strictOrder !== false) || JSON.stringify(stages) !== JSON.stringify(stagesOf(quest))
    : !!name || !!description || stat !== 'INT' || !strictOrder || stages.some(s => s.name || s.description);
  const guardedClose = useEditorGuard(dirty, saving || uncertain);

  // Shown only once the name has been typed in; an untouched form is incomplete, not wrong.
  const [nameTouched, setNameTouched] = useState(false);
  const nameProblem = editing && name === quest.name ? null : validateQuestName(name);
  const nameError = nameTouched ? nameProblem : null;
  const filled = stages.map(s => ({ ...s, name: s.name.trim() })).filter(s => s.name.length > 0);
  const valid = !nameProblem && filled.length >= MIN_STAGES;

  const setStageAt = (i: number, patch: Partial<DraftStage>) => setStages(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const isDone = (id: string | null) => !!quest?.stages.find(s => s.id === id)?.done;
  const removeStage = (i: number) => {
    if (stages.length <= MIN_STAGES || isDone(stages[i].id)) return;
    setStages(prev => prev.filter((_, idx) => idx !== i));
  };
  // Going back to in order needs the done stages to form a run from the start, judged on the draft (removing an open stage can fix a gap).
  const orderBlocked = !strictOrder && !doneStagesFormPrefix(stages.map(s => ({ done: isDone(s.id) })));

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      const draft = {
        name: editing && name === quest.name ? name : normalizeNameBoundaries(name),
        stat,
        description: description.trim() || undefined,
        strictOrder,
        stages: editing
          ? filled.map(s => ({ id: s.id, name: s.name, description: s.description }))
          : filled.map(s => ({ name: s.name, description: s.description ?? '' })),
      };
      await (quest ? saveLongQuest(draft, quest.id) : saveLongQuest(draft));
      setUncertain(false);
      onClose();
    } catch (err) {
      setUncertain(err instanceof UncertainSaveError);
      setError(`The System couldn't ${editing ? 'save that change' : 'create that quest'} — ${formatError(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const errorId = 'long-quest-name-error';
  return (
    <Dialog title={editing ? 'Edit Long Quest' : 'New Long Quest'} pending={saving} initialFocus='input[aria-label="Quest name"]' onClose={() => guardedClose(onClose)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <fieldset disabled={saving || uncertain} className="editor-fields">
          <input aria-label="Quest name" aria-invalid={!!nameError} aria-describedby={nameError ? errorId : undefined} className="field" placeholder="Quest name..." value={name} onChange={e => { setName(e.target.value); setNameTouched(true); }} />
          {nameError && <p id={errorId} role="alert" aria-live="polite" className="phase4-error" style={{ margin: 0 }}>{nameError}</p>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATS.map(s => <StatChip key={s} stat={s} selected={stat === s} onClick={() => setStat(s)} />)}
          </div>
          <textarea className="field" placeholder="Note (optional) — context, why it matters..." value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          <div>
            <label className="gym-checkbox"><input type="checkbox" checked={strictOrder} disabled={orderBlocked} aria-describedby="long-quest-order-hint" onChange={e => setStrictOrder(e.target.checked)} />{CHAIN_ORDER_COPY.label}</label>
            <p id="long-quest-order-hint" className="field-hint">{orderBlocked ? CHAIN_ORDER_COPY.blocked : strictOrder ? CHAIN_ORDER_COPY.hintOn : CHAIN_ORDER_COPY.hintOff}</p>
          </div>
          <div className="field-label" style={{ marginBottom: 0 }}>STAGES</div>
          {stages.map((st, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <input className="field" placeholder={`Stage ${i + 1}...`} value={st.name} onChange={e => setStageAt(i, { name: e.target.value })} />
                <textarea
                  className="field"
                  placeholder="Stage description (optional)"
                  value={st.description ?? ''}
                  onChange={e => { if (isStageDescriptionWithinLimit(e.target.value)) setStageAt(i, { description: e.target.value }); }}
                  aria-label={`Stage ${i + 1} description. Maximum ${STAGE_DESCRIPTION_MAX_LENGTH} characters.`}
                  rows={2}
                />
              </div>
              {editing && stages.length > MIN_STAGES && (
                <button type="button" aria-label={`Remove stage ${i + 1}`} className="phase4-close" disabled={isDone(st.id)} onClick={() => removeStage(i)}>×</button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setStages([...stages, { id: null, name: '', description: null }])} className="btn-secondary">+ Add stage</button>
        </fieldset>
        {error && <p role="alert" className="phase4-error">{error}</p>}
        <div className="action-footer">
          <button type="button" onClick={() => guardedClose(onClose)} disabled={saving} className="btn-secondary">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={!valid || saving} className="btn-primary">
            {saving ? 'SAVING…' : uncertain ? 'CHECK SAVE RESULT' : editing ? 'SAVE CHANGES' : 'CREATE'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
