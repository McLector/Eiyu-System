import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GOOGLE_GENERIC_MESSAGE } from '@eiyu/shared';

import SignaturePanel from '../SignaturePanel';
import { supabase } from '../lib/supabase';
import { GOOGLE_CALLBACK_PATH, completeGoogleCallback, getGoogleOAuthClient, type GoogleCallbackResult } from '../lib/google-oauth';

/** Where Google sends the browser back. Reads the URL once, strips it, then finishes or fails exactly once. */
export default function AuthCallbackPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialUrl = useRef(`${window.location.origin}${location.pathname}${location.search}${location.hash}`);
  const attempt = useRef<Promise<GoogleCallbackResult> | null>(null);

  useEffect(() => {
    // Capture first, then remove the code from the address bar before any network request.
    navigate(GOOGLE_CALLBACK_PATH, { replace: true });
    if (!attempt.current) {
      const href = initialUrl.current;
      initialUrl.current = '';
      attempt.current = Promise.resolve()
        .then(() => completeGoogleCallback(href, { oauth: getGoogleOAuthClient(), main: supabase.auth }))
        .catch((): GoogleCallbackResult => ({ ok: false, message: GOOGLE_GENERIC_MESSAGE, cancelled: false }));
    }
    let active = true;
    void attempt.current.then(result => {
      if (!active) return;
      if (result.ok) navigate('/board', { replace: true });
      else navigate('/auth', { replace: true, state: { googleMessage: { text: result.message, cancelled: result.cancelled } } });
    });
    return () => { active = false; };
  }, [navigate]);

  return (
    <main className="surface-flat auth-page" style={{ minHeight: '100svh', display: 'grid', placeItems: 'center' }}>
      <SignaturePanel className="auth-card" style={{ width: '100%', maxWidth: 440 }}>
        <p role="status">Finishing sign-in…</p>
      </SignaturePanel>
    </main>
  );
}
