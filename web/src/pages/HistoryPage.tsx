import { useNavigate } from 'react-router-dom';

import WebHistory from '../web/WebHistory';
import { useSession } from '../store/session-context';
import { useEiyu } from '../store/eiyu-store';

export default function HistoryPage() {
  const navigate = useNavigate();
  const { user: authUser } = useSession();
  const { user } = useEiyu();

  // RequireAuth guarantees a session exists by the time this route can be
  // reached at all — this is a defensive fallback, not a real code path.
  if (!authUser) return null;

  return <WebHistory userId={authUser.id} timeZone={user.timeZone} onClose={() => navigate('/settings')} />;
}
