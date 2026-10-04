import { useState, type CSSProperties } from 'react';
import {
  LONG_QUEST_COPY,
  LongQuest,
  STAT_COLORS,
  formatDisplayDate,
  formatError,
  stageSequenceState,
} from '@eiyu/shared';
import FlowList from '../components/FlowList';
import Dialog from '../components/Dialog';
import RewardFeedback from '../components/RewardFeedback';
import StateBlock from '../components/StateBlock';
import LongQuestEditorDialog from './LongQuestEditorDialog';
import { StatIcon, PlusIcon, CheckIcon, ChevronIcon, LockIcon } from '../Icons';
import { useEiyu } from '../store/eiyu-store';

type StageStatus = 'done' | 'current' | 'locked';
const STATUS_LABEL: Record<StageStatus, string> = { done: 'Done', current: 'Current', locked: 'Locked' };
// Spelled out whole so the stylesheet hygiene test can find every class it styles.
const ROW_CLASS: Record<StageStatus, string> = { done: 'is-done', current: 'is-current', locked: 'is-locked' };
const CHIP_CLASS: Record<StageStatus, string> = { done: 'is-done', current: 'is-cur', locked: 'is-locked' };
const DESCRIPTION_CLAMP_AT = 140;

function ChainCard({ lq, expanded, onToggleExpand }: { lq: LongQuest; expanded: boolean; onToggleExpand: () => void }) {
  const { user, toggleStage: toggleStageAction, removeLongQuest, pendingStageIds = [] } = useEiyu();
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fullDescription, setFullDescription] = useState(false);
  const statuses = lq.stages.map((stage, index) => {
    const sequence = stageSequenceState(lq.stages, index);
    const status: StageStatus = stage.done ? 'done' : sequence.locked ? 'locked' : 'current';
    return { stage, sequence, status };
  });
  const currentId = statuses.find(item => item.status === 'current')?.stage.id;
  // Stages whose details the viewer flipped away from the default; the current stage's details start open,
  // and that default follows progress instead of staying on the stage that was current at mount.
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set());
  const isOpen = (id: string) => (id === currentId) !== flipped.has(id);
  const done = lq.stages.filter(stage => stage.done).length;
  const percent = lq.stages.length ? Math.round((done / lq.stages.length) * 100) : 0;
  const description = lq.description ?? '';
  const longDescription = description.length > DESCRIPTION_CLAMP_AT || description.includes('\n');
  const toggleOpen = (id: string) => setFlipped(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return (
    <div className="chain-card" style={{ '--quest-stat': STAT_COLORS[lq.stat] } as CSSProperties}>
      <button type="button" className="chain-head" onClick={onToggleExpand} aria-expanded={expanded}>
        <span className="chain-icon"><StatIcon stat={lq.stat} size={17} /></span>
        <span style={{ minWidth: 0 }}>
          <span className="chain-title">{lq.name}</span>
          <span className="chain-meta">
            <span className="quest-chip is-stat">{lq.stat}</span>
            <span>{done} / {lq.stages.length} stages completed</span>
          </span>
        </span>
        <span style={{ transform: `rotate(${expanded ? 180 : 0}deg)`, transition: 'transform var(--dur-base) var(--ease-in-out)', color: 'var(--c-dim-flat)' }}><ChevronIcon direction="down" /></span>
      </button>
      {/* Outside the button: a progressbar inside a button is flattened away from assistive technology. */}
      <div className="chain-bar" role="progressbar" aria-label={`${lq.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ transform: `scaleX(${percent / 100})` }} /></div>

      {expanded && (
        <div className="chain-body">
          {description && (
            <div>
              <p className={`chain-description${longDescription && !fullDescription ? ' is-clamped' : ''}`}>{description}</p>
              {longDescription && <button type="button" className="btn-quiet btn-compact" aria-expanded={fullDescription} onClick={() => setFullDescription(open => !open)}>{fullDescription ? 'Show less' : 'Show more'}</button>}
            </div>
          )}
          <dl className="chain-stats">
            <div><dt>Stages</dt><dd>{lq.stages.length}</dd></div>
            <div><dt>Done</dt><dd>{done}</dd></div>
            <div><dt>Finished</dt><dd>{lq.completedAt ? formatDisplayDate(new Date(lq.completedAt), user.timeZone) : '—'}</dd></div>
          </dl>
          {lq.stages.length === 0 ? (
            <p className="chain-description">This chain has no stages yet. Edit it to add the first one.</p>
          ) : (
            <FlowList label="Stages" size={8} narrowSize={6}>
              {statuses.map(({ stage, sequence, status }, index) => {
                const lockedReason = sequence.reason ?? 'Complete earlier stages first.';
                const open = isOpen(stage.id);
                return (
                  <div className={`chain-stage ${ROW_CLASS[status]}`} key={stage.id} data-item-id={stage.id}>
                    <button
                      type="button"
                      id={`stage-${stage.id}`}
                      className="chain-stage-row"
                      onClick={() => { if (!sequence.locked) toggleStageAction(lq.id, stage.id); }}
                      disabled={pendingStageIds.includes(stage.id)}
                      aria-disabled={sequence.locked}
                      aria-label={`${stage.name}. ${sequence.locked ? lockedReason : stage.done ? 'Completed' : 'Available'}`}
                      title={sequence.locked ? lockedReason : undefined}
                    >
                      <span className="chain-stage-mark">{status === 'done' ? <CheckIcon size={13} /> : status === 'locked' ? <LockIcon size={13} /> : index + 1}</span>
                      <span className="chain-stage-name" title={stage.name}>{stage.name}</span>
                      <span className={`quest-chip ${CHIP_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
                    </button>
                    {stage.description && (
                      <>
                        <button type="button" className="btn-quiet btn-compact chain-stage-more" aria-expanded={open}
                          aria-label={`${open ? 'Hide' : 'Show'} details for ${stage.name}`} onClick={() => toggleOpen(stage.id)}>
                          {open ? 'Hide details' : 'Show details'}
                        </button>
                        {open && <p className="chain-stage-description">{stage.description}</p>}
                      </>
                    )}
                  </div>
                );
              })}
            </FlowList>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setEditing(true)} className="btn-secondary">EDIT</button>
            <button type="button" onClick={() => setConfirmDelete(true)} className="btn-destructive">DELETE LONG QUEST</button>
          </div>
        </div>
      )}

      {confirmDelete && <Dialog title="Delete Long Quest" pending={deletePending} onClose={() => setConfirmDelete(false)}><p>Delete {lq.name} and its stages? Earned XP remains.</p>{deleteError && <p role="alert" className="phase4-error">{deleteError}</p>}<div className="action-footer"><button className="btn-secondary" disabled={deletePending} onClick={() => setConfirmDelete(false)}>Cancel</button><button className="btn-destructive" disabled={deletePending} onClick={async () => { setDeletePending(true); setDeleteError(null); try { await removeLongQuest(lq.id); setConfirmDelete(false); } catch (err) { setDeleteError(formatError(err)); } finally { setDeletePending(false); } }}>Delete Long Quest</button></div></Dialog>}
      {editing && <LongQuestEditorDialog quest={lq} onClose={() => setEditing(false)} />}
    </div>
  );
}

export default function WebLongQuests() {
  const { user, stageRewardNotice, rewardReceipt, longQuestsLoading, longQuestsError, retryLongQuests } = useEiyu();
  // undefined = the viewer has not chosen yet, so the first chain opens by default.
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [showNew, setShowNew] = useState(false);
  const expanded = chosen === undefined ? user.longQuests[0]?.id ?? null : chosen;
  const rewardCardShown = !!rewardReceipt && !rewardReceipt.replayed && rewardReceipt.totals.length > 0;

  return (
    <div className="long-quests-page">
      {/* The reward card is itself a status region; announce the notice only when no card carries it. */}
      {stageRewardNotice && <p className="stage-notice" role={rewardCardShown ? undefined : 'status'}>{stageRewardNotice}</p>}<RewardFeedback receipt={rewardReceipt} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 className="page-title">CHAIN PROGRESSION</h2>
          <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted-flat)', marginTop: 4 }}>20 XP per phase · 20 XP completion bonus</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-secondary">
          <PlusIcon />
          NEW QUEST
        </button>
      </div>

      {showNew && <LongQuestEditorDialog onClose={() => setShowNew(false)} />}

      {longQuestsError && user.longQuests.length > 0 && <StateBlock kind="error" retryLabel="Retry refresh" onRetry={() => void retryLongQuests()}>{longQuestsError}</StateBlock>}
      {longQuestsLoading && !user.longQuests.length ? (
        <StateBlock kind="loading">Reading your quest log…</StateBlock>
      ) : longQuestsError && !user.longQuests.length ? (
        <StateBlock kind="error" retryLabel="RETRY" onRetry={() => void retryLongQuests()}>{longQuestsError}</StateBlock>
      ) : (
        <div className="long-quest-list">
          <FlowList label="Chains" size={2} protectEditors>
            {user.longQuests.length === 0 ? (
              <StateBlock kind="empty" title={LONG_QUEST_COPY.emptyTitle}>{LONG_QUEST_COPY.empty}</StateBlock>
            ) : (
              user.longQuests.map(lq => (
                <ChainCard key={lq.id} lq={lq} expanded={expanded === lq.id} onToggleExpand={() => setChosen(expanded === lq.id ? null : lq.id)} />
              ))
            )}
          </FlowList>
        </div>
      )}
    </div>
  );
}
