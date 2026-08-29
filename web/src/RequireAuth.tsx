import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useSession } from './store/session-context';

export default function RequireAuth() {
  const { session, loading } = useSession();
  const location = useLocation();

  if (loading) return null;
  if (!session) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
