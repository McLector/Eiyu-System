import { Navigate } from 'react-router-dom';

import { useSession } from '../store/session-context';
import { useOperatorStatus } from '../store/operator';

/** Where a signed-in person lands: an operator goes to /admin (which asks for MFA if needed); everyone else, and any failure, to `fallback`. */
export default function PostSignInRedirect({ fallback = '/board' }: { fallback?: string }) {
  const { user } = useSession();
  const state = useOperatorStatus(user?.id);
  if (state.phase === 'loading') return null;
  if (state.phase === 'ready' && state.status.isOperator) return <Navigate to="/admin" replace />;
  return <Navigate to={fallback} replace />;
}
