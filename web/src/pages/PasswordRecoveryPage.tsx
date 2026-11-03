import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Link, useLocation, useNavigate} from 'react-router-dom';
import {beginPasswordRecovery, parseRecoveryLink, RECOVERY_LINK_ERROR, saveRecoveredPassword, type RecoveryAuth} from '@eiyu/shared';
import {PasswordInput} from '../components/PasswordInput';
import SignaturePanel from '../SignaturePanel';
import {createRecoveryAuth, supabase} from '../lib/supabase';

async function currentOwner() {
 const {data, error} = await supabase.auth.getSession();
 if (error) throw new Error('Account status unavailable');
 return data.session?.user.id ?? null;
}

export default function PasswordRecoveryPage() {
 const location = useLocation(), navigate = useNavigate();
 const initialUrl = useRef(`${window.location.origin}${location.pathname}${location.search}${location.hash}`);
 const attempt = useRef<{auth: RecoveryAuth | null; ready: Promise<string>} | null>(null);
 const mounted = useRef(false), saving = useRef(false);
 const [owner, setOwner] = useState<string | null>(null);
 const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
 const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
 const [result, setResult] = useState<{cleanupFailed: boolean} | null>(null);

 useEffect(() => {
  mounted.current = true;
  // Capture first, then remove credentials before starting any network request.
  navigate('/auth/recovery', {replace: true});
  if (!attempt.current) {
   try {
    const tokens = parseRecoveryLink(initialUrl.current, `${window.location.origin}/auth/recovery`);
    initialUrl.current = '';
    const auth = createRecoveryAuth();
    attempt.current = {auth, ready: beginPasswordRecovery(auth, tokens, currentOwner)};
   } catch {
    initialUrl.current = '';
    attempt.current = {auth: null, ready: Promise.reject(new Error(RECOVERY_LINK_ERROR))};
   }
  }
  let active = true;
  void attempt.current.ready.then(value => {if (active) setOwner(value);})
   .catch(err => {if (active) setError(err instanceof Error ? err.message : RECOVERY_LINK_ERROR);});
  return () => {active = false; mounted.current = false;};
 }, [navigate]);

 const submit = async (event: FormEvent) => {
  event.preventDefault();
  if (saving.current || !owner || !attempt.current?.auth || result) return;
  saving.current = true; setBusy(true); setError(null);
  try {
   const saved = await saveRecoveredPassword(attempt.current.auth, owner, password, confirmation, currentOwner);
   if (mounted.current) {setPassword(''); setConfirmation(''); setResult(saved);}
  } catch (err) {
   if (mounted.current) setError(err instanceof Error ? err.message : RECOVERY_LINK_ERROR);
  } finally {
   saving.current = false;
   if (mounted.current) setBusy(false);
  }
 };

 return <main className="surface-flat auth-page" style={{minHeight: '100svh', display: 'grid', placeItems: 'center'}}>
  <SignaturePanel className="auth-card" style={{width: '100%', maxWidth: 440}}>
   <h1>{result ? 'Password updated' : 'Reset your password'}</h1>
   {result ? <p>Your password has been updated. {result.cleanupFailed ? 'The recovery session could not be closed on the server. Close this page and sign in again.' : 'You can now sign in with your new password.'}</p> : <>
    {error && <p role="alert">{error}</p>}
    {!owner && !error && <p role="status">Checking recovery link…</p>}
    {owner && <form className="auth-form" onSubmit={event => void submit(event)}>
     <label className="field-label auth-label" htmlFor="recovery-password">NEW PASSWORD</label>
     <PasswordInput id="recovery-password" aria-label="New password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy}/>
     <label className="field-label auth-label" htmlFor="recovery-confirm">CONFIRM NEW PASSWORD</label>
     <PasswordInput id="recovery-confirm" aria-label="Confirm new password" toggleLabel="confirm password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy}/>
     <button className="btn-primary" disabled={busy}>{busy ? 'SAVING…' : 'SAVE NEW PASSWORD'}</button>
    </form>}
   </>}
   <Link className="btn-secondary" to="/auth">Back to sign in</Link>
  </SignaturePanel>
 </main>;
}
