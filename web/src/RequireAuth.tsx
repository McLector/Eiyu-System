import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useSession } from './store/session-context';
import GoogleFinishGate from './web/GoogleFinishGate';

export default function RequireAuth() {
  const { session, loading, signOut } = useSession();
  const location = useLocation();

  if (loading) return null;
  if (!session) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }
  // A Google-created account must confirm its birthday before any protected page renders.
  return <GoogleFinishGate user={session.user} onSignOut={signOut}><Outlet /></GoogleFinishGate>;
}
