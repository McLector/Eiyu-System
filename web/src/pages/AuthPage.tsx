import { Navigate, useLocation, type Location } from 'react-router-dom';

import { useSession } from '../store/session-context';
import DevAuth from '../DevAuth';

export default function AuthPage() {
  const { session, loading } = useSession();
  const location = useLocation();

  if (loading) return null;
  if (session) {
    const from = (location.state as { from?: Location } | null)?.from;
    return <Navigate to={from?.pathname ?? '/board'} replace />;
  }
  return <DevAuth onAuthenticated={() => {}} />;
}
