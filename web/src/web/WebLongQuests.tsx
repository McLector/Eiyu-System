import JourneyMap from '../components/JourneyMap';
import FlowList from '../components/FlowList';
import Dialog from '../components/Dialog';
import RewardFeedback from '../components/RewardFeedback';
import LongQuestEditorDialog from './LongQuestEditorDialog';
import { LONG_QUEST_COPY } from '@eiyu/shared';
import StateBlock from '../components/StateBlock';
import { useState } from 'react';
import {
  LongQuest,
  STAT_COLORS,
  formatError,
  stageSequenceState,
} from '@eiyu/shared';
import { StatIcon, PlusIcon, CheckIcon, ChevronIcon, NoteIcon } from '../Icons';
import { useEiyu } from '../store/eiyu-store';

/** The row mounts when the card expands, which can land a frame after the click; retry briefly instead of focusing nothing. */
function focusStageRow(id: string, framesLeft = 10) {
  const row = document.getElementById(`stage-${id}`);
  if (row) row.focus();
  else if (framesLeft > 0) requestAnimationFrame(() => focusStageRow(id, framesLeft - 1));
}

// ── Quest card ───────────────────────────────────────────

function LongQuestCard({ lq, isFirst, expanded, onToggleExpand }: {
  lq: LongQuest; isFirst: boolean; expanded: boolean; onToggleExpand: () => void;
}) {
  const { toggleStage: toggleStageAction, removeLongQuest, pendingStageIds = [] } = useEiyu();
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const color = STAT_COLORS[lq.stat];

  const toggleStage = (stageId: string) => {
    toggleStageAction(lq.id, stageId);
  };

  return (
    <div style={{ borderTop: isFirst ? 'none' : '1px solid var(--c-divider-flat)', paddingTop: isFirst ? 0 : 8 }}>
      <JourneyMap quest={lq} expanded={expanded} onSelect={id => { if (!expanded) onToggleExpand(); focusStageRow(id); }} />
      {/* Header */}
      <button onClick={onToggleExpand} aria-expanded={expanded} style={{
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
          {lq.description && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'Inter', fontSize: 12, color: 'var(--c-muted-flat)', marginTop: 4 }}>
              <NoteIcon size={12} color="var(--c-muted-flat)" /> {lq.description}
            </div>
          )}
        </div>
        <div style={{ transform: `rotate(${expanded ? 180 : 0}deg)`, transition: 'transform var(--dur-base) var(--ease-in-out)', color: 'var(--c-dim-flat)', flexShrink: 0 }}>
          <ChevronIcon />
        </div>
      </button>

      <p className="journey-summary">{lq.stat} · {lq.stages.filter(s => s.done).length} / {lq.stages.length} stages completed</p>

      {/* Stage checklist */}
      {expanded && (
        <div className="stage-list-wrap">
          <div className="field-label">STAGES</div>
          <div className="stage-list">
            {lq.stages.map((stage, index) => {
              const sequence = stageSequenceState(lq.stages, index);
              const lockedReason = sequence.reason ?? 'Complete earlier stages first.';
              return (
                <button
                  key={stage.id}
                  id={`stage-${stage.id}`}
                  className={`stage-row${stage.done ? ' is-done' : ''}${sequence.locked ? ' is-locked' : ''}`}
                  onClick={() => { if (!sequence.locked) toggleStage(stage.id); }}
                  disabled={pendingStageIds.includes(stage.id)}
                  aria-disabled={sequence.locked}
                  aria-label={`${stage.name}. ${sequence.locked ? lockedReason : stage.done ? 'Completed' : 'Available'}`}
                  title={sequence.locked ? lockedReason : undefined}
                >
                  <span className="stage-box" style={{ '--stat': color } as React.CSSProperties}>{stage.done && <CheckIcon />}</span>
                  <span className="stage-text">
                    <span className="stage-name">{stage.name}</span>
                    {stage.description && <span className="stage-note">{stage.description}</span>}
                  </span>
                  {sequence.locked && <span className="stage-flag">LOCKED</span>}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => setEditing(true)} className="btn-secondary">
              EDIT
            </button>
            <button onClick={() => setConfirmDelete(true)} className="btn-destructive">
              DELETE LONG QUEST
            </button>
          </div>
        </div>
      )}

      {confirmDelete && <Dialog title="Delete Long Quest" pending={deletePending} onClose={() => setConfirmDelete(false)}><p>Delete {lq.name} and its stages? Earned XP remains.</p>{deleteError && <p role="alert" className="phase4-error">{deleteError}</p>}<div className="action-footer"><button className="btn-secondary" disabled={deletePending} onClick={() => setConfirmDelete(false)}>Cancel</button><button className="btn-destructive" disabled={deletePending} onClick={async () => { setDeletePending(true); setDeleteError(null); try { await removeLongQuest(lq.id); setConfirmDelete(false); } catch (err) { setDeleteError(formatError(err)); } finally { setDeletePending(false); } }}>Delete Long Quest</button></div></Dialog>}
      {editing && <LongQuestEditorDialog quest={lq} onClose={() => setEditing(false)} />}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────

export default function WebLongQuests() {
  const { user, stageRewardNotice, rewardReceipt, longQuestsLoading, longQuestsError, retryLongQuests } = useEiyu();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const rewardCardShown = !!rewardReceipt && !rewardReceipt.replayed && rewardReceipt.totals.length > 0;

  return (
    <div className="long-quests-page">
      {/* The reward card is itself a status region; announce the notice only when no card carries it. */}
      {stageRewardNotice && <p className="stage-notice" role={rewardCardShown ? undefined : 'status'}>{stageRewardNotice}</p>}<RewardFeedback receipt={rewardReceipt} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 className="page-title">LONG QUESTS</h2>
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
        <FlowList label="Long Quests" size={2} protectEditors>
          {user.longQuests.length === 0 ? (
            <StateBlock kind="empty" title={LONG_QUEST_COPY.emptyTitle}>{LONG_QUEST_COPY.empty}</StateBlock>
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
