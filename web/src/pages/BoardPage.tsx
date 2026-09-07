import { useNavigate, useOutletContext } from 'react-router-dom';

import type { LayoutContext } from '../ProtectedLayout';
import WebBoard from '../web/WebBoard';

export default function BoardPage() {
  const navigate = useNavigate();
  const { darkMode } = useOutletContext<LayoutContext>();
  return (
    <WebBoard
      onNewQuest={() => navigate('/quest-editor')}
      onEditQuest={id => navigate(`/quest-editor/${id}`)}
      darkMode={darkMode}
    />
  );
}
