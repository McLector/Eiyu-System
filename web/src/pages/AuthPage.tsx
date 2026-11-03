import { useLocation, type Location } from 'react-router-dom';

import { useSession } from '../store/session-context';
import WebAuth from '../web/WebAuth';
import PostSignInRedirect from '../web/PostSignInRedirect';

export default function AuthPage() {
  const { session, loading, signOutError, clearSignOutError } = useSession();
  const location = useLocation();

  if (loading) return null;
  if (session) {
    const from = (location.state as { from?: Location } | null)?.from;
    return <PostSignInRedirect fallback={from?.pathname ?? '/board'} />;
  }
  return <WebAuth onLogin={() => {}} logoutWarning={signOutError} onDismissLogoutWarning={clearSignOutError} />;
}
