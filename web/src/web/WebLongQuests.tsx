import JourneyMap from '../components/JourneyMap';
import FlowList from '../components/FlowList';
import Dialog from '../components/Dialog';
import RewardFeedback from '../components/RewardFeedback';
import { useEditorGuard } from '../components/NavigationGuard';
import { useState } from 'react';
import {
  LongQuest,
  STAGE_DESCRIPTION_MAX_LENGTH,
  STAT_COLORS,
  formatError,
  isStageDescriptionWithinLimit,
  normalizeNameBoundaries,
  stageSequenceState,
  validateQuestName,
  type Stat,
  UncertainSaveError,
} from '@eiyu/shared';
import { StatIcon, PlusIcon, CheckIcon, ChevronIcon, NoteIcon } from '../Icons';
import { useEiyu } from '../store/eiyu-store';

// ── Quest card ───────────────────────────────────────────

function LongQuestCard({ lq, isFirst, expanded, onToggleExpand }: {
  lq: LongQuest; isFirst: boolean; expanded: boolean; onToggleExpand: () => void;
}) {
  const { toggleStage: toggleStageAction, removeLongQuest, saveLongQuest, pendingStageIds = [] } = useEiyu();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(lq.name);
  const [editStat, setEditStat] = useState<Stat>(lq.stat);
  const [editDescription, setEditDescription] = useState(lq.description ?? '');
  const [editStages, setEditStages] = useState<{ id: string | null; name: string; description: string | null }[]>(
    lq.stages.map(s => ({ id: s.id, name: s.name, description: s.description }))
  );
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const color = STAT_COLORS[lq.stat];

  const toggleStage = (stageId: string) => {
    toggleStageAction(lq.id, stageId);
  };

  const startEditing = () => {
    setEditName(lq.name);
    setEditStat(lq.stat);
    setEditDescription(lq.description ?? '');
    setEditStages(lq.stages.map(s => ({ id: s.id, name: s.name, description: s.description })));
    setSaveError(null);
    setEditing(true);
  };

  const MIN_STAGES = 1;
  const closeEditor = useEditorGuard(editing && (editName !== lq.name || editStat !== lq.stat || editDescription !== (lq.description ?? '') || JSON.stringify(editStages) !== JSON.stringify(lq.stages.map(s => ({ id: s.id, name: s.name, description: s.description })))), saving || uncertain);
  const [deletePending, setDeletePending] = useState(false);

  const setEditStageNameAt = (i: number, value: string) => {
    setEditStages(prev => prev.map((s, idx) => (idx === i ? { ...s, name: value } : s)));
  };

  const setEditStageDescriptionAt = (i: number, value: string) => {
    setEditStages(prev => prev.map((s, idx) => (idx === i ? { ...s, description: value } : s)));
  };

  const removeEditStage = (i: number) => {
    if (editStages.length <= MIN_STAGES || lq.stages.find(s => s.id === editStages[i].id)?.done) return;
    setEditStages(prev => prev.filter((_, idx) => idx !== i));
  };

  const filledEditStages = editStages
    .map(s => ({ ...s, name: s.name.trim() }))
    .filter(s => s.name.length > 0);
  const editNameError = editName === lq.name ? null : validateQuestName(editName);
  const editValid = !editNameError && filledEditStages.length >= MIN_STAGES;

  const saveEdit = async () => {
    if (!editValid || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveLongQuest(
        {
          name: editName === lq.name ? editName : normalizeNameBoundaries(editName),
          stat: editStat,
          description: editDescription.trim() || undefined,
          stages: filledEditStages.map(s => ({ id: s.id, name: s.name, description: s.description })),
        },
        lq.id
      );
      setUncertain(false); setEditing(false);
    } catch (err) {
      setUncertain(err instanceof UncertainSaveError);
      setSaveError(`The System couldn't save that change — ${formatError(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ borderTop: isFirst ? 'none' : '1px solid var(--c-divider-flat)', paddingTop: isFirst ? 0 : 8 }}>
      <JourneyMap quest={lq} expanded={expanded} onSelect={id => { if (!expanded) onToggleExpand(); requestAnimationFrame(() => document.getElementById(`stage-${id}`)?.focus()); }} />
      {/* Header */}
      <button onClick={() => closeEditor(onToggleExpand)} style={{
        width: '100%', padding: '22px 0 16px', display: 'flex', alignItems: 'center', gap: 16,
        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11, flexShrink: 0,
          background: color + '18', border: `1.5px solid ${color}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <StatIcon stat={lq.stat} size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.04em' }}>
            {lq.name}
          </div>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, color, letterSpacing: '0.1em', marginTop: 2 }}>
            {lq.stat}
          </div>
          {lq.description && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Inter', fontSize: 12, color: 'var(--c-muted-flat)', marginTop: 4 }}>
              <NoteIcon size={12} color="var(--c-muted-flat)" /> {lq.description}
            </div>
          )}
        </div>
        <div style={{ transform: `rotate(${expanded ? 180 : 0}deg)`, transition: 'transform 0.2s', color: 'var(--c-dim-flat)', flexShrink: 0 }}>
          <ChevronIcon />
        </div>
      </button>

      <p className="journey-summary">{lq.stat} · {lq.stages.filter(s => s.done).length} / {lq.stages.length} stages completed</p>

      {/* Stage checklist — expanded, hidden while editing */}
      {expanded && !editing && (
        <div style={{ borderTop: '1px solid var(--c-divider-flat)', padding: '16px 0 24px' }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--c-dim-flat)', marginBottom: 12 }}>
            STAGES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lq.stages.map((stage, index) => {
              const sequence = stageSequenceState(lq.stages, index);
              const lockedReason = sequence.reason ?? 'Complete earlier stages first.';
              return (
              <button
                key={stage.id}
                id={`stage-${stage.id}`}
                onClick={() => { if (!sequence.locked) toggleStage(stage.id); }}
                disabled={pendingStageIds.includes(stage.id)}
                aria-disabled={sequence.locked}
                aria-label={`${stage.name}. ${sequence.locked ? lockedReason : stage.done ? 'Completed' : 'Available'}`}
                title={sequence.locked ? lockedReason : undefined}
                style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                borderRadius: 8, cursor: sequence.locked ? 'not-allowed' : 'pointer', textAlign: 'left', width: '100%',
                background: stage.done ? 'rgba(74,222,128,0.05)' : 'var(--c-accent-glass)',
                border: `1px solid ${stage.done ? 'rgba(74,222,128,0.15)' : 'var(--c-glass-border)'}`,
                opacity: sequence.locked ? 0.58 : 1,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  background: stage.done ? 'rgba(74,222,128,0.18)' : 'transparent',
                  border: `1.5px solid ${stage.done ? 'rgba(74,222,128,0.5)' : color + '55'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {stage.done && <CheckIcon />}
                </div>
                <span style={{ display: 'flex', flex: 1, minWidth: 0, flexDirection: 'column', gap: 2 }}>
                  <span style={{
                    fontFamily: 'Inter', fontSize: 13,
                    color: stage.done ? 'var(--c-muted-flat)' : 'var(--c-text)',
                    textDecoration: stage.done ? 'line-through' : 'none',
                  }}>
                    {stage.name}
                  </span>
                  {stage.description && (
                    <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-dim-flat)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                      {stage.description}
                    </span>
                  )}
                  {sequence.locked && (
                    <span style={{ fontFamily: 'Inter', fontSize: 10, color: 'var(--c-dim-flat)' }}>
                      {lockedReason}
                    </span>
                  )}
                </span>
                {sequence.locked && (
                  <span style={{ fontFamily: 'Rajdhani', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--c-dim-flat)' }}>
                    LOCKED
                  </span>
                )}
              </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={startEditing}
              className="btn-ghost"
              style={{
                padding: '10px', fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700,
                color: 'var(--c-accent)', letterSpacing: '0.08em',
              }}
            >
              EDIT
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                padding: '10px', borderRadius: 8,
                cursor: 'pointer', transition: 'all 0.15s',
                background: confirmDelete ? 'rgba(248,113,113,0.12)' : 'transparent',
                border: `1px solid ${confirmDelete ? 'rgba(248,113,113,0.45)' : 'rgba(248,113,113,0.2)'}`,
                fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700,
                color: '#f87171', letterSpacing: '0.08em',
              }}
            >
              DELETE LONG QUEST
            </button>
          </div>
        </div>
      )}

      {confirmDelete && <Dialog title="Delete Long Quest" pending={deletePending} onClose={() => setConfirmDelete(false)}><p>Delete {lq.name} and its stages? Earned XP remains.</p>{saveError && <p role="alert">{saveError}</p>}<div className="action-footer"><button className="btn-secondary" disabled={deletePending} onClick={() => setConfirmDelete(false)}>Cancel</button><button className="btn-destructive" disabled={deletePending} onClick={async () => { setDeletePending(true); try { await removeLongQuest(lq.id); setConfirmDelete(false); } catch (err) { setSaveError(formatError(err)); } finally { setDeletePending(false); } }}>Delete Long Quest</button></div></Dialog>}
      {/* Edit form — replaces the stage checklist while editing */}
      {expanded && editing && (
        <div style={{ borderTop: '1px solid var(--c-divider-flat)', padding: '16px 0 24px' }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.1em', marginBottom: 14 }}>EDIT LONG QUEST</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <fieldset disabled={saving || uncertain} className="editor-fields">
            <input aria-label="Quest name" aria-invalid={!!editNameError} aria-describedby={editNameError ? 'long-quest-edit-name-error' : undefined} className="field" placeholder="Quest name..." value={editName} onChange={e => setEditName(e.target.value)} />
            {editNameError && <p id="long-quest-edit-name-error" role="alert" aria-live="polite" style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{editNameError}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['STR','INT','DEX','WIS','CHA'] as const).map(s => (
                <button key={s} onClick={() => setEditStat(s)} className="btn-ghost" style={{ padding: '5px 12px', fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, color: editStat === s ? STAT_COLORS[s] : 'var(--c-muted-flat)', borderColor: editStat === s ? STAT_COLORS[s] + '55' : 'var(--c-accent-border)' }}>
                  {s}
                </button>
              ))}
            </div>
            <textarea
              className="field"
              placeholder="Note (optional) — context, why it matters..."
              value={editDescription}
              onChange={e => setEditDescription(e.target.value)}
              rows={2}
            />
            <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim-flat)' }}>STAGES</div>
            {editStages.map((st, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 6 }}>
                  <input
                    className="field"
                    placeholder={`Stage ${i + 1}...`}
                    value={st.name}
                    onChange={e => setEditStageNameAt(i, e.target.value)}
                  />
                  <textarea
                    className="field"
                    placeholder="Stage description (optional)"
                    value={st.description ?? ''}
                    onChange={e => {
                      if (isStageDescriptionWithinLimit(e.target.value)) {
                        setEditStageDescriptionAt(i, e.target.value);
                      }
                    }}
                    aria-label={`Stage ${i + 1} description. Maximum ${STAGE_DESCRIPTION_MAX_LENGTH} characters.`}
                    rows={3}
                  />
                </div>
                {editStages.length > MIN_STAGES && (
                  <button
                    aria-label={`Remove stage ${i + 1}`}
                    className="phase4-close"
                    disabled={!!lq.stages.find(s => s.id === st.id)?.done}
                    onClick={() => removeEditStage(i)}
                    style={{ background: 'none', border: 'none', color: 'var(--c-dim-flat)', fontSize: 18, cursor: 'pointer', padding: '0 6px' }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setEditStages([...editStages, { id: null, name: '', description: null }])} style={{ background: 'none', border: '1px dashed var(--c-glass-border)', borderRadius: 8, padding: '8px', fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim-flat)', cursor: 'pointer' }}>
              + Add stage
            </button>
            </fieldset>
            {saveError && <p role="alert" style={{ color: '#f87171', fontSize: 12 }}>{saveError}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => void saveEdit()}
                disabled={!editValid || saving}
                className="btn-ghost"
                style={{ padding: '10px', fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.08em', opacity: !editValid || saving ? 0.5 : 1 }}
              >
                {saving ? 'SAVING…' : uncertain ? 'CHECK SAVE RESULT' : 'SAVE CHANGES'}
              </button>
              <button onClick={() => closeEditor(() => setEditing(false))} style={{ padding: '10px 18px', background: 'none', border: '1px solid var(--c-glass-border)', borderRadius: 6, fontFamily: 'Inter', fontSize: 12, color: 'var(--c-muted-flat)', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────

export default function WebLongQuests() {
  const { user, stageRewardNotice, rewardReceipt, longQuestsLoading, longQuestsError, retryLongQuests, saveLongQuest } = useEiyu();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStat, setNewStat] = useState<Stat>('INT');
  const [newStages, setNewStages] = useState(['', '']);
  const [newStageDescriptions, setNewStageDescriptions] = useState(['', '']);
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const newNameError = validateQuestName(newName);
  const closeNew = useEditorGuard(showNew && (!!newName || !!newDescription || newStat !== 'INT' || newStages.some(Boolean) || newStageDescriptions.some(Boolean)), creating || uncertain);

  const addLongQuest = async () => {
    if (newNameError || creating) return;
    const stages = newStages
      .map((stageName, index) => ({ name: stageName.trim(), description: newStageDescriptions[index] }))
      .filter(stage => stage.name.length > 0);
    if (stages.length === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      await saveLongQuest({
        name: normalizeNameBoundaries(newName),
        stat: newStat,
        description: newDescription.trim() || undefined,
        stages,
      });
      setUncertain(false); setShowNew(false);
      setNewName('');
      setNewDescription('');
      setNewStages(['', '']);
      setNewStageDescriptions(['', '']);
    } catch (err) {
      setUncertain(err instanceof UncertainSaveError);
      setCreateError(`The System couldn't create that quest — ${formatError(err)}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="long-quests-page">
      {stageRewardNotice && <p role="status">{stageRewardNotice}</p>}<RewardFeedback receipt={rewardReceipt} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontFamily: 'Rajdhani', fontSize: 22, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.06em', margin: 0 }}>LONG QUESTS</h2>
          <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted-flat)', marginTop: 4 }}>20 XP per phase · 20 XP completion bonus</p>
        </div>
        <button onClick={() => showNew ? closeNew(() => setShowNew(false)) : setShowNew(true)} className="btn-ghost" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.08em' }}>
          <PlusIcon />
          NEW QUEST
        </button>
      </div>

      {showNew && (
        <div style={{ padding: '16px 0 20px', borderTop: '1px solid var(--c-divider-flat)', borderBottom: '1px solid var(--c-divider-flat)', marginBottom: 20 }}>
          <div style={{ fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.1em', marginBottom: 14 }}>NEW LONG QUEST</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <fieldset disabled={creating || uncertain} className="editor-fields">
            <input aria-label="Quest name" aria-invalid={!!newNameError} aria-describedby={newNameError ? 'long-quest-new-name-error' : undefined} className="field" placeholder="Quest name..." value={newName} onChange={e => setNewName(e.target.value)} />
            {newNameError && <p id="long-quest-new-name-error" role="alert" aria-live="polite" style={{ color: '#f87171', fontSize: 12, margin: 0 }}>{newNameError}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['STR','INT','DEX','WIS','CHA'] as const).map(s => (
                <button key={s} onClick={() => setNewStat(s)} className="btn-ghost" style={{ padding: '5px 12px', fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700, color: newStat === s ? STAT_COLORS[s] : 'var(--c-muted-flat)', borderColor: newStat === s ? STAT_COLORS[s] + '55' : 'var(--c-accent-border)' }}>
                  {s}
                </button>
              ))}
            </div>
            <textarea
              className="field"
              placeholder="Note (optional) — context, why it matters..."
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
              rows={2}
            />
            <div style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--c-dim-flat)' }}>STAGES</div>
            {newStages.map((st, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input className="field" placeholder={`Stage ${i + 1}...`} value={st} onChange={e => setNewStages(newStages.map((s, j) => j === i ? e.target.value : s))} />
                <textarea
                  className="field"
                  placeholder="Stage description (optional)"
                  value={newStageDescriptions[i] ?? ''}
                  onChange={e => {
                    if (isStageDescriptionWithinLimit(e.target.value)) {
                      setNewStageDescriptions(newStageDescriptions.map((value, j) => j === i ? e.target.value : value));
                    }
                  }}
                  aria-label={`Stage ${i + 1} description. Maximum ${STAGE_DESCRIPTION_MAX_LENGTH} characters.`}
                  rows={3}
                />
              </div>
            ))}
            <button onClick={() => { setNewStages([...newStages, '']); setNewStageDescriptions([...newStageDescriptions, '']); }} style={{ background: 'none', border: '1px dashed var(--c-glass-border)', borderRadius: 8, padding: '8px', fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim-flat)', cursor: 'pointer' }}>
              + Add stage
            </button>
            </fieldset>
            {createError && <p role="alert" style={{ color: '#f87171', fontSize: 12 }}>{createError}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={() => void addLongQuest()} disabled={!!newNameError || creating} className="btn-ghost" style={{ padding: '10px', fontFamily: 'Rajdhani', fontSize: 13, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.08em', opacity: newNameError || creating ? 0.5 : 1 }}>{uncertain ? 'CHECK SAVE RESULT' : 'CREATE'}</button>
              <button onClick={() => closeNew(() => setShowNew(false))} style={{ padding: '10px 18px', background: 'none', border: '1px solid var(--c-glass-border)', borderRadius: 6, fontFamily: 'Inter', fontSize: 12, color: 'var(--c-muted-flat)', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {longQuestsError && user.longQuests.length > 0 && <div role="alert"><p>{longQuestsError}</p><button className="btn-secondary" onClick={() => void retryLongQuests()}>Retry refresh</button></div>}
      {longQuestsLoading && !user.longQuests.length ? (
        <div style={{ padding: 40, textAlign: 'center', fontFamily: 'Inter', fontSize: 13, color: 'var(--c-dim-flat)' }}>Reading your quest log…</div>
      ) : longQuestsError && !user.longQuests.length ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ fontFamily: 'Inter', fontSize: 13, color: '#f87171', marginBottom: 12 }}>{longQuestsError}</p>
          <button onClick={() => void retryLongQuests()} className="btn-ghost" style={{ padding: '8px 16px', fontFamily: 'Rajdhani', fontSize: 12, fontWeight: 700 }}>RETRY</button>
        </div>
      ) : (
        <div className="long-quest-list">
        <FlowList label="Long Quests" size={2} protectEditors>
          {user.longQuests.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Rajdhani', fontSize: 16, fontWeight: 700, color: 'var(--c-dim-flat)', letterSpacing: '0.06em', marginBottom: 6 }}>NO LONG QUESTS</div>
              <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-dim-flat)' }}>Create a multi-stage quest to track your big goals</div>
            </div>
          ) : (
            user.longQuests.map((lq, i) => (
              <LongQuestCard
                key={lq.id} lq={lq} isFirst={i === 0}
                expanded={expanded === lq.id}
                onToggleExpand={() => setExpanded(expanded === lq.id ? null : lq.id)}
              />
            ))
          )}
        </FlowList>
        </div>
      )}
    </div>
  );
}
