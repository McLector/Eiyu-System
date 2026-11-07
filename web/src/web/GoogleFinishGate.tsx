import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  LEGAL_DOCUMENTS,
  acceptTerms,
  fetchTermsStatus,
  formatError,
  needsTermsAcceptance,
  type LegalDocumentId,
} from '@eiyu/shared';

import Dialog from '../components/Dialog';
import SignaturePanel from '../SignaturePanel';

interface GateUser { id: string; app_metadata?: { provider?: unknown; [key: string]: unknown } | null }
interface Props { user: GateUser; onSignOut: () => Promise<unknown>; children: ReactNode }

type Status = 'loading' | 'ready';

const LINK = { padding: 0, border: 0, background: 'none', color: 'var(--c-accent-text)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 } as const;

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="surface-flat auth-page" style={{ minHeight: '100svh', display: 'grid', placeItems: 'center' }}>
      <SignaturePanel className="auth-card" style={{ width: '100%', maxWidth: 440 }}>{children}</SignaturePanel>
    </main>
  );
}

function SignOutButton({ onSignOut }: { onSignOut: () => Promise<unknown> }) {
  return <button type="button" className="btn-secondary" onClick={() => { void Promise.resolve(onSignOut()).catch(() => {}); }}>Sign out</button>;
}

function AcceptTermsScreen({ userId, onDone, onSignOut }: {
  userId: string; onDone: () => void; onSignOut: () => Promise<unknown>;
}) {
  // Never pre-ticked: the agreement has to be a choice made on this screen.
  const [terms, setTerms] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocumentId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving.current || !terms) return;
    saving.current = true; setBusy(true); setError(null);
    try {
      await acceptTerms(userId);
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
      <p>One last step: please read and accept the Privacy Policy and Terms to start using Eiyu.</p>
      <form className="auth-form" onSubmit={event => void submit(event)}>
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
        {error && <p role="alert" style={{ fontSize: 12, color: 'var(--c-danger)' }}>{error}</p>}
        <button type="submit" className="btn-primary" disabled={busy || !terms} style={{ width: '100%', minHeight: 46 }}>{busy ? 'SAVING…' : 'CONTINUE'}</button>
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
 * Blocks the app for an account that has no Terms acceptance on record, which today means a new Google
 * account (password sign-ups record the Terms from the sign-up form, and older accounts were backfilled).
 * The gate keys on the missing record, never on the sign-in provider. A status read that fails, or that
 * belongs to another account, opens the app: a failed read must never trap anyone behind this screen.
 * Sign-out is always available on the screen.
 */
export default function GoogleFinishGate({ user, onSignOut, children }: Props) {
  const userId = user.id;
  const [status, setStatus] = useState<Status>('loading');
  const [needsTerms, setNeedsTerms] = useState(false);

  // A token refresh hands over a new user object; only a different account may restart the lookup.
  useEffect(() => {
    let active = true;
    setStatus('loading'); setNeedsTerms(false);
    fetchTermsStatus().then(terms => {
      if (!active) return;
      setNeedsTerms(terms.userId === userId && needsTermsAcceptance(terms));
      setStatus('ready');
    }).catch(() => {
      if (!active) return;
      setNeedsTerms(false);
      setStatus('ready');
    });
    return () => { active = false; };
  }, [userId]);

  if (status === 'loading') return <Shell><p role="status">Checking your account…</p></Shell>;
  if (needsTerms) return <AcceptTermsScreen userId={userId} onDone={() => setNeedsTerms(false)} onSignOut={onSignOut} />;
  return <>{children}</>;
}
