import { useRef, useState } from 'react';
import { formatError, partitionBoardQuests, type Quest } from '@eiyu/shared';
import { useEiyu } from '../store/eiyu-store';
import Dialog from '../components/Dialog';
import PaginatedList from '../components/PaginatedList';
import StateBlock from '../components/StateBlock';
import { BoardDeleteDialog } from './WebBoard';
import ArchivedCard from './ArchivedCard';
import QuestDetailsDialog from './QuestDetailsDialog';

export default function ArchivedHabits({ onClose }: { onClose: () => void }) {
  const { user, questsLoading, questsError, restoreQuest, deleteQuest, retryQuests } = useEiyu();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [target, setTarget] = useState<Quest | null>(null);
  const [details, setDetails] = useState<Quest | null>(null);
  const inFlight = useRef(false);
  const restore = async (id: string): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true; setPending(id); setError(null);
    try { await restoreQuest(id); return true; } catch (err) { setError(formatError(err)); return false; }
    finally { inFlight.current = false; setPending(null); }
  };
  return <>
    <Dialog title="Archived habits" onClose={onClose} pending={pending !== null || target !== null}>
      {questsLoading ? <StateBlock kind="loading">Reading archived habits…</StateBlock> : questsError ? <StateBlock kind="error" onRetry={() => void retryQuests()}>{questsError}</StateBlock> :
        <div className="archive-list"><PaginatedList label="Archived habits" empty="No archived habits. Your archived definitions and their history stay here.">
          {partitionBoardQuests(user.quests ?? []).archivedQuests.map(quest => <ArchivedCard key={quest.id} quest={quest} pending={pending !== null} onOpen={() => setDetails(quest)} onRestore={() => void restore(quest.id)} onDelete={() => setTarget(quest)} />)}
        </PaginatedList></div>}
      {error && <p role="alert" className="phase4-error">{error}</p>}
    </Dialog>
    {details && <QuestDetailsDialog
      quest={details}
      onClose={() => setDetails(null)}
      archived={{ pending: pending !== null, onRestore: () => { const id = details.id; void restore(id).then(ok => { if (ok) setDetails(null); }); }, onDelete: () => { setTarget(details); setDetails(null); } }}
    />}
    {target && <BoardDeleteDialog quest={target} onCancel={() => setTarget(null)} onDelete={deleteQuest} />}
  </>;
}
