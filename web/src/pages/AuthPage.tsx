import { useEffect, useState } from 'react';
import { useLocation, useNavigate, type Location } from 'react-router-dom';
import { GOOGLE_EXPIRED_MESSAGE, readExpiredGoogleSignIn } from '@eiyu/shared';

import { useSession } from '../store/session-context';
import WebAuth, { type GoogleMessage } from '../web/WebAuth';
import PostSignInRedirect from '../web/PostSignInRedirect';

const EXPIRED: GoogleMessage = { text: GOOGLE_EXPIRED_MESSAGE, cancelled: false };

export default function AuthPage() {
  const { session, loading, signOutError, clearSignOutError } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  // An expired Google sign-in lands here (the site URL), not on the callback page. Read it once from the first URL.
  const [expired] = useState(() => readExpiredGoogleSignIn(`${location.pathname}${location.search}${location.hash}`));

  useEffect(() => {
    if (expired) navigate('/auth', { replace: true, state: { googleMessage: EXPIRED } });
  }, [expired, navigate]);

  if (loading) return null;
  if (session) {
    const from = (location.state as { from?: Location } | null)?.from;
    return <PostSignInRedirect fallback={from?.pathname ?? '/board'} />;
  }
  const googleMessage = (location.state as { googleMessage?: GoogleMessage } | null)?.googleMessage ?? (expired ? EXPIRED : null);
  return <WebAuth onLogin={() => {}} logoutWarning={signOutError} onDismissLogoutWarning={clearSignOutError} googleMessage={googleMessage} />;
}
