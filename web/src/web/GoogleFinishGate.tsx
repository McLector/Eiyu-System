import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  CHILD_PRIVACY_NOTICE,
  LEGAL_DOCUMENTS,
  PROCESSING_NOTICES,
  fetchAccountAge,
  fetchProcessingAccess,
  finishGoogleSignup,
  formatError,
  needsGoogleSignupFinish,
  validateSignupBirthday,
  type LegalDocumentId,
  type ProcessingAccess,
} from '@eiyu/shared';

import Dialog from '../components/Dialog';
import SignaturePanel from '../SignaturePanel';

interface GateUser { id: string; app_metadata?: { provider?: unknown; [key: string]: unknown } | null }
interface Props { user: GateUser; onSignOut: () => Promise<unknown>; children: ReactNode }

type Status = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready' };

const LINK = { padding: 0, border: 0, background: 'none', color: 'var(--c-accent-text)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 } as const;

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

function FinishSignup({ initialAccess, onDone, onSignOut }: {
  initialAccess: ProcessingAccess; onDone: () => void; onSignOut: () => Promise<unknown>;
}) {
  const notice = PROCESSING_NOTICES['age-screening'];
  // Kept in memory only. A birth date is never written to browser storage.
  const [birthday, setBirthday] = useState('');
  const [consent, setConsent] = useState(false);
  // Never pre-ticked, even for an account that already gave the birthday permission.
  const [terms, setTerms] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocumentId | null>(null);
  const access = initialAccess;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving.current) return;
    const birthdayError = validateSignupBirthday(birthday);
    if (!consent && !access.ageConsent) { setError('Review the birthday notice and give specific permission before finishing.'); return; }
    if (!terms) { setError('Accept the Privacy Policy and Terms to continue.'); return; }
    if (birthdayError) { setError(birthdayError); return; }
    saving.current = true; setBusy(true); setError(null);
    try {
      // One call saves the permission and the birthday together: a failure keeps neither, and a retry is the same call.
      await finishGoogleSignup(birthday, access);
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
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minHeight: 44, paddingBlock: 10 }}>
          <input type="checkbox" aria-label="I agree to the Privacy Policy & Terms" checked={terms} disabled={busy}
            onChange={e => setTerms(e.target.checked)} />
          <span style={{ fontSize: 13, lineHeight: 1.6 }}>
            I agree to the{' '}
            <button type="button" style={LINK} onClick={() => setLegalDocument('privacy')}>Privacy Policy</button>
            {' '}and{' '}
            <button type="button" style={LINK} onClick={() => setLegalDocument('terms')}>Terms of Use</button>.
          </span>
        </div>
        <label className="field-label auth-label" htmlFor="finish-birthday">BIRTHDAY</label>
        <input id="finish-birthday" aria-label="Birthday" className="field" placeholder="YYYY-MM-DD" autoComplete="bday"
          value={birthday} disabled={busy} onChange={e => setBirthday(e.target.value)} />
        {error && <p role="alert" style={{ fontSize: 12, color: 'var(--c-danger)' }}>{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy} style={{ width: '100%', minHeight: 46 }}>{busy ? 'SAVING…' : 'FINISH SIGN-UP'}</button>
      </form>
      <SignOutButton onSignOut={onSignOut} />
      {legalDocument && (
        <Dialog title={LEGAL_DOCUMENTS[legalDocument].title} onClose={() => setLegalDocument(null)}>
          <div tabIndex={0} aria-label={`${LEGAL_DOCUMENTS[legalDocument].title} content`} style={{ paddingRight: 8 }}>
            {LEGAL_DOCUMENTS[legalDocument].sections.map(section => (
              <section key={section.heading} style={{ marginBottom: 20 }}>
                <h3 style={{ margin: '0 0 7px', fontFamily: 'Rajdhani', fontSize: 13, color: 'var(--c-accent-text)', letterSpacing: '0.1em' }}>{section.heading}</h3>
                <p style={{ margin: 0, fontFamily: 'Inter', fontSize: 14, lineHeight: 1.75, color: 'var(--c-muted-flat)', overflowWrap: 'anywhere' }}>{section.body}</p>
              </section>
            ))}
          </div>
        </Dialog>
      )}
    </Shell>
  );
}

/**
 * Blocks the app for an account Google created that has not yet confirmed its birthday. A password
 * account never reaches the lookup. Permission and birthday are saved in one call, and an account that
 * has the permission but no birthday (left by the earlier two-call screen) is shown the screen again.
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
    Promise.all([fetchProcessingAccess(), fetchAccountAge()]).then(([next, age]) => {
      if (!active) return;
      if (next.userId !== userId || age.userId !== userId) throw new Error('Account status belongs to another account.');
      setAccess(next);
      setFinishing(needsGoogleSignupFinish(latestUser.current, next, age));
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
  if (finishing && access) return <FinishSignup initialAccess={access} onDone={() => setFinishing(false)} onSignOut={onSignOut} />;
  return <>{children}</>;
}
