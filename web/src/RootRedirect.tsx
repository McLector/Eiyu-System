import { Navigate } from 'react-router-dom';

import { useSession } from './store/session-context';

export default function RootRedirect() {
  const { session, loading } = useSession();
  if (loading) return null;
  return <Navigate to={session ? '/board' : '/auth'} replace />;
}
