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
  // An account with no Terms acceptance on record (a new Google account) accepts them before any protected page renders.
  return <GoogleFinishGate user={session.user} onSignOut={signOut}><Outlet /></GoogleFinishGate>;
}
