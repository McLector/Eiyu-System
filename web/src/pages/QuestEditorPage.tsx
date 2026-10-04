import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import WebQuestEditor from '../web/WebQuestEditor';
import { useEiyu } from '../store/eiyu-store';

export default function QuestEditorPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, questsLoading, backlog = [], backlogLoading = false } = useEiyu();

  // Don't judge the id against a quest list that hasn't loaded yet — a
  // direct deep-link/refresh to /quest-editor/:id mounts this before the
  // real habits query resolves. Wait, then judge.
  // Backlog quests are read separately from the board's quests, so wait for both.
  if (id && (questsLoading || backlogLoading)) return null;

  const editingQuest = id ? (user.quests.find(q => q.id === id) ?? backlog.find(q => q.id === id) ?? null) : null;

  // A real id that resolves to nothing — deleted, typo'd, or (RLS makes
  // these indistinguishable to the client) another user's — is a
  // different case from "no id at all, this is a create," and must not
  // silently render an empty create-form.
  if (id && !editingQuest) {
    return <Navigate to="/board" replace />;
  }

  return <WebQuestEditor key={id ?? searchParams.get('type') ?? 'habit'} editingQuest={editingQuest} initialType={searchParams.get('type') === 'one_time' || searchParams.get('type') === 'backlog' ? (searchParams.get('type') as 'one_time' | 'backlog') : 'habit'} onClose={() => navigate('/board')} />;
}
