import { useNavigate } from 'react-router-dom';

import WebBoard from '../web/WebBoard';

export default function BoardPage() {
  const navigate = useNavigate();
  return (
    <WebBoard
      onNewQuest={() => navigate('/quest-editor')}
      onEditQuest={id => navigate(`/quest-editor/${id}`)}
    />
  );
}
