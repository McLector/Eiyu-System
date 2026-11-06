import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  CHILD_PRIVACY_NOTICE,
  PROCESSING_NOTICES,
  fetchProcessingAccess,
  formatError,
  needsGoogleSignupFinish,
  setAccountBirthday,
  setProcessingConsent,
  validateSignupBirthday,
  type ProcessingAccess,
} from '@eiyu/shared';

import SignaturePanel from '../SignaturePanel';

interface GateUser { id: string; app_metadata?: { provider?: unknown; [key: string]: unknown } | null }
interface Props { user: GateUser; onSignOut: () => Promise<unknown>; children: ReactNode }

type Status = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' };

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="surface-flat auth-page" style={{ minHeight: '100svh', display: 'grid', placeItems: 'center' }}>
      <SignaturePanel className="auth-card" style={{ width: '100%', maxWidth: 440 }}>{children}</SignaturePanel>
    </main>
  );
}

function SignOutButton({ onSignOut }: { onSignOut: () => Promise<unknown> }) {
  return <button type="button" className="btn-secondary" onClick={() => { void onSignOut().catch(() => {}); }}>Sign out</button>;
}

function FinishSignup({ userId, initialAccess, onDone, onSignOut }: {
  userId: string; initialAccess: ProcessingAccess; onDone: () => void; onSignOut: () => Promise<unknown>;
}) {
  const notice = PROCESSING_NOTICES['age-screening'];
  // Kept in memory only. A birth date is never written to browser storage.
  const [birthday, setBirthday] = useState('');
  const [consent, setConsent] = useState(false);
  const [access, setAccess] = useState(initialAccess);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving.current) return;
    const birthdayError = validateSignupBirthday(birthday);
    if (!consent && !access.ageConsent) { setError('Review the birthday notice and give specific permission before finishing.'); return; }
    if (birthdayError) { setError(birthdayError); return; }
    saving.current = true; setBusy(true); setError(null);
    try {
      let current = access;
      // Consent first: the birthday save refuses an account without it. A retry skips what already saved.
      if (!current.ageConsent) { current = await setProcessingConsent('age-screening', true, notice.version, current); setAccess(current); }
      await setAccountBirthday(birthday, userId);
      onDone();
    } catch (err) {
      setError(formatError(err));
    } finally {
      saving.current = false; setBusy(false);
    }
  };

  return (
    <Shell>
      <h1>Finish signing up</h1>
      <p>Your Google account is connected. Confirm your birthday to start using Eiyu.</p>
      <form className="auth-form" onSubmit={event => void submit(event)}>
        <p style={{ fontSize: 13, lineHeight: 1.6 }}>{CHILD_PRIVACY_NOTICE}</p>
        <p style={{ fontSize: 13, lineHeight: 1.6 }}>{notice.body}</p>
        <label style={{ display: 'flex', gap: 10, minHeight: 44, paddingBlock: 10 }}>
          <input type="checkbox" checked={consent || access.ageConsent} disabled={busy || access.ageConsent} onChange={e => setConsent(e.target.checked)} />
          <span>{notice.label}</span>
        </label>
        <label className="field-label auth-label" htmlFor="finish-birthday">BIRTHDAY</label>
        <input id="finish-birthday" aria-label="Birthday" className="field" placeholder="YYYY-MM-DD" autoComplete="bday"
          value={birthday} disabled={busy} onChange={e => setBirthday(e.target.value)} />
        {error && <p role="alert" style={{ fontSize: 12, color: 'var(--c-danger)' }}>{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ width: '100%', minHeight: 46 }}>{busy ? 'SAVING…' : 'FINISH SIGN-UP'}</button>
      </form>
      <SignOutButton onSignOut={onSignOut} />
    </Shell>
  );
}

/**
 * Blocks the app for an account Google created that has not yet confirmed its birthday. A password
 * account never reaches the lookup. The screen stays up until both saves succeed, so a half-finished
 * save cannot let the user past it.
 */
export default function GoogleFinishGate({ user, onSignOut, children }: Props) {
  const isGoogle = user.app_metadata?.provider === 'google';
  const userId = user.id;
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [access, setAccess] = useState<ProcessingAccess | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // A token refresh hands over a new user object; only a different account (or a retry) may restart the lookup.
  const latestUser = useRef(user);
  latestUser.current = user;

  useEffect(() => {
    if (!isGoogle) return;
    let active = true;
    setStatus({ kind: 'loading' }); setFinishing(false); setAccess(null);
    fetchProcessingAccess().then(next => {
      if (!active) return;
      if (next.userId !== userId) throw new Error('Account status belongs to another account.');
      setAccess(next);
      setFinishing(needsGoogleSignupFinish(latestUser.current, next));
      setStatus({ kind: 'ready' });
    }).catch(() => { if (active) setStatus({ kind: 'error' }); });
    return () => { active = false; };
  }, [userId, isGoogle, attempt]);

  if (!isGoogle) return <>{children}</>;
  if (status.kind === 'loading') return <Shell><p role="status">Checking your account…</p></Shell>;
  if (status.kind === 'error') {
    return (
      <Shell>
        <p role="alert">We couldn&apos;t check your account. Try again, or sign out.</p>
        <button type="button" className="btn-primary" onClick={() => setAttempt(n => n + 1)}>Try again</button>
        <SignOutButton onSignOut={onSignOut} />
      </Shell>
    );
  }
  if (finishing && access) return <FinishSignup userId={userId}initialAccess={access} onDone={() => setFinishing(false)} onSignOut={onSignOut} />;
  return <>{children}</>;
}
