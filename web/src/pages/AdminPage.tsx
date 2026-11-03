import { Navigate } from 'react-router-dom';

import { useSession } from '../store/session-context';
import { useOperatorStatus } from '../store/operator';
import AdminConsole from '../web/AdminConsole';
import AdminMfa from '../web/AdminMfa';

/** The server enforces operator access on every call; this page only decides what to draw. A non-operator sees nothing. */
export default function AdminPage() {
  const { user } = useSession();
  const state = useOperatorStatus(user?.id);
  if (state.phase === 'loading') return null;
  if (state.phase === 'error' || !state.status.isOperator || !user) return <Navigate to="/board" replace />;
  if (state.status.aal !== 'aal2') return <AdminMfa onVerified={state.refresh} />;
  return <AdminConsole key={user.id} userId={user.id} />;
}
