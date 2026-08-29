import { useNavigate } from 'react-router-dom';

import WebHistory from '../web/WebHistory';
import { useSession } from '../store/session-context';

export default function HistoryPage() {
  const navigate = useNavigate();
  const { user } = useSession();

  // RequireAuth guarantees a session exists by the time this route can be
  // reached at all — this is a defensive fallback, not a real code path.
  if (!user) return null;

  return <WebHistory userId={user.id} onClose={() => navigate('/settings')} />;
}
