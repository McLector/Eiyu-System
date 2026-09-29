import { useNavigate, useOutletContext } from 'react-router-dom';

import type { LayoutContext } from '../ProtectedLayout';
import { useSession } from '../store/session-context';
import WebBoard from '../web/WebBoard';

export default function BoardPage() {
  const navigate = useNavigate();
  const { darkMode } = useOutletContext<LayoutContext>();
  const { user } = useSession();
  return (
    <WebBoard
      onNewQuest={() => navigate('/quest-editor')}
      onEditQuest={id => navigate(`/quest-editor/${id}`)}
      darkMode={darkMode}
      storageScope={`board:${user?.id ?? 'guest'}`}
    />
  );
}
