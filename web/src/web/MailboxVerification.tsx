import { useEffect, useRef, useState } from 'react';
import { fetchMailboxStatus, sendMailboxCode, verifyMailboxCode, formatError, MAILBOX_MESSAGE, type MailboxStatus } from '@eiyu/shared';

export default function MailboxVerification({ userId, onVerified, refreshRevision = 0, purpose = 'weekly-debrief' }: { userId: string; onVerified: () => void; refreshRevision?: number; purpose?: 'weekly-debrief' | 'account-export' }) {
  const [status, setStatus] = useState<MailboxStatus | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  // `epoch` guards status reads, which every refresh supersedes. `scope` guards
  // user actions (send, verify, check): a passive refresh must not discard an
  // answer still in flight, only a change of account, purpose or unmount does.
  const epoch = useRef(0);
  const scope = useRef(0);
  const owner = useRef(userId);
  const ownerPurpose = useRef(purpose);
  const acting = useRef(false);
  const observed = useRef<MailboxStatus | null>(null);
  const done = useRef(onVerified);
  useEffect(() => { done.current = onVerified; }, [onVerified]);
  useEffect(() => () => { scope.current++; }, []);
  useEffect(() => {
    const current = ++epoch.current;
    if (owner.current !== userId || ownerPurpose.current !== purpose) {
      owner.current = userId; ownerPurpose.current = purpose; observed.current = null;
      scope.current++; acting.current = false;
      setStatus(null); setChallenge(null); setCode(''); setRemaining(0); setBusy(false);
    }
    setError(null);
    void fetchMailboxStatus().then(value => {
      if (epoch.current !== current) return;
      if (value.userId !== userId) throw new Error('Your account changed. Check verification status again.');
      if (observed.current && value.version < observed.current.version) return;
      if (observed.current && value.version !== observed.current.version) { setChallenge(null); setCode(''); }
      const notify = purpose === 'weekly-debrief' && value.verified && (!observed.current?.verified || value.version !== observed.current.version);
      observed.current = value;
      setStatus(value); if (notify) done.current();
    }).catch(err => { if (epoch.current === current) setError(formatError(err)); });
    return () => { epoch.current = current + 1; };
  }, [userId, refreshRevision, purpose]);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining(n => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  const act = async (action: 'send' | 'verify' | 'check') => {
    if (busy || acting.current) return;
    const current = scope.current, startVersion = observed.current?.version;
    const live = () => scope.current === current;
    // A refresh that saw a different mailbox version means the email changed under this request.
    const unchanged = () => live() && observed.current?.version === startVersion;
    acting.current = true; setBusy(true); setError(null);
    try {
      if (action === 'verify') {
        if (!challenge || !status) return;
        const verified = await verifyMailboxCode(challenge, code.trim(), status);
        if (live()) { observed.current = verified; setStatus(verified); setCode(''); done.current(); }
      } else {
        const fresh = await fetchMailboxStatus();
        if (!live()) return;
        if (fresh.userId !== userId) throw new Error('Your account changed. Check verification status again.');
        if (status && fresh.version !== status.version) { setChallenge(null); setCode(''); }
        observed.current = fresh; setStatus(fresh);
        if (fresh.verified) { done.current(); return; }
        if (action === 'send') {
          const sentFor = fresh.version;
          const next = await sendMailboxCode();
          if (live() && (observed.current?.version ?? sentFor) === sentFor) { setChallenge(next.challengeId); setCode(''); setRemaining(next.retryAfter); }
        }
      }
    } catch (err) { if (live()) setError(formatError(err)); }
    finally { if (live()) { acting.current = false; setBusy(false); } }
  };
  return <div style={{ display: 'grid', gap: 10 }}>
    <p style={{ margin: 0 }}>{purpose === 'account-export' ? 'Verify your email to download your account data.' : MAILBOX_MESSAGE} Your quests remain available.</p>
    {error && <p role="alert" style={{ margin: 0, color: 'var(--c-danger)' }}>{error}</p>}
    {!status && !error && <p role="status">Checking verification status…</p>}
    {status && <button className="btn-secondary" disabled={busy || remaining > 0} onClick={() => void act('send')}>
      {remaining > 0 ? `Resend in ${remaining}s` : challenge ? 'Resend verification email' : 'Send verification email'}
    </button>}
    {challenge && <>
      <label>Verification code<input aria-label="Verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={event => setCode(event.target.value)} disabled={busy} /></label>
      <button className="btn-primary" disabled={busy || !/^\d{6,10}$/.test(code.trim())} onClick={() => void act('verify')}>Verify code</button>
    </>}
    <button className="btn-secondary" disabled={busy} onClick={() => void act('check')}>Check verification status</button>
  </div>;
}
