import { useState, type CSSProperties } from 'react';
import {
  LONG_QUEST_COPY,
  LongQuest,
  STAT_COLORS,
  formatDisplayDate,
  formatError,
  stageSequenceState,
} from '@eiyu/shared';
import ActionMenu, { type ActionMenuItem } from '../components/ActionMenu';
import FlowList from '../components/FlowList';
import Dialog from '../components/Dialog';
import RewardFeedback from '../components/RewardFeedback';
import StateBlock from '../components/StateBlock';
import LongQuestEditorDialog from './LongQuestEditorDialog';
import { StatIcon, PlusIcon, CheckIcon, ChevronIcon, LockIcon, UndoIcon } from '../Icons';
import { useEiyu } from '../store/eiyu-store';

type StageStatus = 'done' | 'current' | 'locked';
const STATUS_LABEL: Record<StageStatus, string> = { done: 'Done', current: 'Current', locked: 'Locked' };
// Spelled out whole so the stylesheet hygiene test can find every class it styles.
const ROW_CLASS: Record<StageStatus, string> = { done: 'is-done', current: 'is-current', locked: 'is-locked' };
const CHIP_CLASS: Record<StageStatus, string> = { done: 'is-done', current: 'is-cur', locked: 'is-locked' };
const DESCRIPTION_CLAMP_AT = 140;

function ChainPanel({ lq }: { lq: LongQuest }) {
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
  const titleId = `chain-title-${lq.id}`;

  return (
    <article className="chain-panel" aria-labelledby={titleId} style={{ '--quest-stat': STAT_COLORS[lq.stat] } as CSSProperties}>
      <header className="chain-panel-head">
        <span className="chain-icon"><StatIcon stat={lq.stat} size={17} /></span>
        <div style={{ minWidth: 0 }}>
          <span className="quest-chip is-stat">{lq.stat}</span>
          <h3 id={titleId} className="chain-title">{lq.name}</h3>
        </div>
      </header>
      {description && (
        <div>
          <p className={`chain-description${longDescription && !fullDescription ? ' is-clamped' : ''}`}>{description}</p>
          {longDescription && <button type="button" className="btn-quiet btn-compact" aria-expanded={fullDescription} onClick={() => setFullDescription(open => !open)}>{fullDescription ? 'Show less' : 'Show more'}</button>}
        </div>
      )}
      <dl className="chain-stats">
        <div><dt>Stages</dt><dd>{lq.stages.length}</dd></div>
        <div><dt>Done</dt><dd>{done}</dd></div>
        <div><dt>Created</dt><dd>{lq.createdAt ? formatDisplayDate(new Date(lq.createdAt), user.timeZone) : '—'}</dd></div>
        <div><dt>Finished</dt><dd>{lq.completedAt ? formatDisplayDate(new Date(lq.completedAt), user.timeZone) : '—'}</dd></div>
      </dl>
      <div>
        <div className="chain-progress-head"><span>Progress</span><span>{percent}%</span></div>
        <div className="chain-bar" role="progressbar" aria-label={`${lq.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ transform: `scaleX(${percent / 100})` }} /></div>
      </div>
      {lq.stages.length === 0 ? (
        <p className="chain-description">This chain has no stages yet. Edit it to add the first one.</p>
      ) : (
        <FlowList label="Stages" size={8} narrowSize={6}>
          {statuses.map(({ stage, sequence, status }, index) => {
            const open = isOpen(stage.id);
            const pending = pendingStageIds.includes(stage.id);
            const items: ActionMenuItem[] = [
              ...(stage.description ? [{ label: open ? 'Hide details' : 'Show details', onSelect: () => toggleOpen(stage.id), icon: <ChevronIcon direction={open ? 'up' : 'down'} size={14} /> }] : []),
              // Only the last finished stage can be undone; the database enforces the same order.
              ...(stage.done && !sequence.locked ? [{ label: 'Mark not done', onSelect: () => toggleStageAction(lq.id, stage.id), icon: <UndoIcon size={14} />, disabled: pending }] : []),
            ];
            return (
              <div className={`chain-stage ${ROW_CLASS[status]}`} key={stage.id} data-item-id={stage.id}>
                <div className="chain-stage-row">
                  <span className="chain-stage-mark">{status === 'done' ? <CheckIcon size={13} /> : status === 'locked' ? <LockIcon size={13} /> : index + 1}</span>
                  <span className="chain-stage-name" title={stage.name}>{stage.name}</span>
                  <span className={`quest-chip ${CHIP_CLASS[status]}`} title={status === 'locked' ? sequence.reason ?? undefined : undefined}>{STATUS_LABEL[status]}</span>
                  {status === 'locked' && <span className="sr-only">{sequence.reason ?? 'Complete earlier stages first.'}</span>}
                  {items.length > 0 && <ActionMenu label={`Actions for ${stage.name}`} items={items} />}
                </div>
                {((open && stage.description) || status === 'current') && (
                  <div className="chain-stage-body">
                    {open && stage.description && <p className="chain-stage-description">{stage.description}</p>}
                    {status === 'current' && (
                      <button type="button" className="btn-primary btn-compact chain-complete" disabled={pending} onClick={() => toggleStageAction(lq.id, stage.id)}>
                        <CheckIcon size={14} />COMPLETE STAGE
                      </button>
                    )}
                  </div>
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

      {confirmDelete && <Dialog title="Delete Long Quest" pending={deletePending} onClose={() => setConfirmDelete(false)}><p>Delete {lq.name} and its stages? Earned XP remains.</p>{deleteError && <p role="alert" className="phase4-error">{deleteError}</p>}<div className="action-footer"><button className="btn-secondary" disabled={deletePending} onClick={() => setConfirmDelete(false)}>Cancel</button><button className="btn-destructive" disabled={deletePending} onClick={async () => { setDeletePending(true); setDeleteError(null); try { await removeLongQuest(lq.id); setConfirmDelete(false); } catch (err) { setDeleteError(formatError(err)); } finally { setDeletePending(false); } }}>Delete Long Quest</button></div></Dialog>}
      {editing && <LongQuestEditorDialog quest={lq} onClose={() => setEditing(false)} />}
    </article>
  );
}

/** The chain picker beside the selected chain, so you can jump between chains without leaving the page. */
function ChainNav({ chains, selectedId, onSelect, onNew }: { chains: LongQuest[]; selectedId: string; onSelect: (id: string) => void; onNew: () => void }) {
  return (
    <nav className="chain-nav" aria-label="Your chains">
      <span className="chain-nav-label">Your chains</span>
      <FlowList label="Chains" size={6} narrowSize={4} protectEditors>
        {chains.map(quest => (
          <button key={quest.id} type="button" data-item-id={quest.id} className={`chain-nav-item${quest.id === selectedId ? ' is-selected' : ''}`}
            aria-current={quest.id === selectedId ? 'true' : undefined} onClick={() => onSelect(quest.id)}>
            <span className="chain-nav-name">{quest.name}</span>
            <span className="chain-nav-count">{quest.stages.filter(stage => stage.done).length}/{quest.stages.length}</span>
          </button>
        ))}
      </FlowList>
      <button type="button" className="btn-secondary chain-nav-new" onClick={onNew}><PlusIcon size={14} />NEW CHAIN</button>
    </nav>
  );
}

export default function WebLongQuests() {
  const { user, stageRewardNotice, rewardReceipt, longQuestsLoading, longQuestsError, retryLongQuests } = useEiyu();
  // Until the viewer picks one (or after the picked chain is deleted), the first chain is the selected one.
  const [chosen, setChosen] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const selected = user.longQuests.find(quest => quest.id === chosen) ?? user.longQuests[0];
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
        selected ? (
          <div className="chain-layout">
            <ChainPanel key={selected.id} lq={selected} />
            <ChainNav chains={user.longQuests} selectedId={selected.id} onSelect={setChosen} onNew={() => setShowNew(true)} />
          </div>
        ) : (
          <StateBlock kind="empty" title={LONG_QUEST_COPY.emptyTitle}>{LONG_QUEST_COPY.empty}</StateBlock>
        )
      )}
    </div>
  );
}
