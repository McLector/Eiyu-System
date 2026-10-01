import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatError, partitionBoardQuests, type Quest } from '@eiyu/shared';
import { useEiyu } from '../store/eiyu-store';
import Dialog from '../components/Dialog';
import PaginatedList from '../components/PaginatedList';
import { ArchivedCard, BoardDeleteDialog } from './WebBoard';

export default function ArchivedHabits({ onClose }: { onClose: () => void }) {
  const { user, questsLoading, questsError, restoreQuest, deleteQuest, retryQuests } = useEiyu();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [target, setTarget] = useState<Quest | null>(null);
  const inFlight = useRef(false);
  const restore = async (id: string) => {
    if (inFlight.current) return;
    inFlight.current = true; setPending(id); setError(null);
    try { await restoreQuest(id); } catch (err) { setError(formatError(err)); }
    finally { inFlight.current = false; setPending(null); }
  };
  return <>
    <Dialog title="Archived habits" onClose={onClose} pending={pending !== null || target !== null}>
      {questsLoading ? <p role="status">Reading archived habits…</p> : questsError ? <div role="alert"><p>{questsError}</p><button className="btn-ghost" onClick={() => void retryQuests()}>Retry</button></div> :
        <div className="archive-list"><PaginatedList label="Archived habits" empty="No archived habits. Your archived definitions and their history stay here.">
          {partitionBoardQuests(user.quests ?? []).archivedQuests.map(quest => <ArchivedCard key={quest.id} quest={quest} pending={pending !== null} onEdit={() => navigate(`/quest-editor/${quest.id}`)} onRestore={() => void restore(quest.id)} onDelete={() => setTarget(quest)} />)}
        </PaginatedList></div>}
      {error && <p role="alert" className="phase4-error">{error}</p>}
    </Dialog>
    {target && <BoardDeleteDialog quest={target} onCancel={() => setTarget(null)} onDelete={deleteQuest} />}
  </>;
}
