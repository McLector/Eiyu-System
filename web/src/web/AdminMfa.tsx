import { useEffect, useRef, useState, type FormEvent } from 'react';

import { supabase } from '../lib/supabase';
import { useSession } from '../store/session-context';

type Step = 'checking' | 'verify' | 'start' | 'enrolled';

/** Second step for an operator signed in with a password only. Uses the supabase-js TOTP API; nothing here is logged or stored. */
export default function AdminMfa({ onVerified }: { onVerified: () => void }) {
  const { signOut } = useSession();
  const [step, setStep] = useState<Step>('checking');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [stale, setStale] = useState<string[]>([]);
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const enrolling = useRef(false);

  useEffect(() => {
    let live = true;
    supabase.auth.mfa.listFactors().then(({ data, error: err }) => {
      if (!live) return;
      if (err || !data) { setError('We could not check your authenticator. Reload and try again.'); setStep('start'); return; }
      const verified = data.totp?.[0];
      if (verified) { setFactorId(verified.id); setStep('verify'); return; }
      setStale((data.all ?? []).filter(f => f.factor_type === 'totp' && f.status === 'unverified').map(f => f.id));
      setStep('start');
    }).catch(() => { if (live) { setError('We could not check your authenticator. Reload and try again.'); setStep('start'); } });
    return () => { live = false; };
  }, []);
  useEffect(() => { if (error) alertRef.current?.focus(); }, [error]);
  useEffect(() => { if (step === 'verify' || step === 'enrolled') codeRef.current?.focus(); }, [step]);

  const startEnrol = async () => {
    if (enrolling.current) return;
    enrolling.current = true; setBusy(true); setError(null);
    try {
      for (const id of stale) await supabase.auth.mfa.unenroll({ factorId: id });
      const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Eiyu admin', issuer: 'Eiyu' });
      if (err || !data) throw new Error('enrol');
      const qr = data.totp.qr_code;
      setSetup({ qr: qr.startsWith('data:') ? qr : `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`, secret: data.totp.secret });
      setFactorId(data.id); setStale([]); setStep('enrolled');
    } catch { setError('We could not start authenticator setup. Try again.'); }
    finally { enrolling.current = false; setBusy(false); }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !factorId) return;
    if (!/^\d{6}$/.test(code.trim())) { setError('Enter the 6 digits shown in your authenticator app.'); return; }
    setBusy(true); setError(null);
    try {
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (err) throw new Error('verify');
      onVerified();
    } catch { setError('That code did not work. Check the app and try again.'); setCode(''); }
    finally { setBusy(false); }
  };

  const errorLine = error && <p role="alert" tabIndex={-1} ref={alertRef}>{error}</p>;
  return <main style={{ maxWidth: 480, margin: '0 auto', padding: 24, display: 'grid', gap: 12 }}>
    <h1>Admin sign-in</h1>
    {step === 'checking' && <p role="status">Checking…</p>}
    {step === 'start' && <>
      <p>Admin access needs an authenticator app. Set one up for this account.</p>
      {errorLine}
      <button type="button" className="btn-primary" disabled={busy} onClick={() => void startEnrol()}>Set up authenticator app</button>
    </>}
    {(step === 'verify' || step === 'enrolled') && <form onSubmit={event => void verify(event)} style={{ display: 'grid', gap: 12 }}>
      {step === 'enrolled' && setup && <>
        <p>Scan this code with your authenticator app, or type the setup key.</p>
        <img src={setup.qr} alt="QR code for your authenticator app" width={192} height={192} />
        <p>Setup key: <code>{setup.secret}</code></p>
      </>}
      <label style={{ display: 'grid', gap: 4 }}>
        6-digit code
        <input ref={codeRef} value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} disabled={busy}
          onChange={event => setCode(event.target.value)} />
      </label>
      {errorLine}
      <button type="submit" className="btn-primary" disabled={busy}>Verify</button>
    </form>}
    <button type="button" className="btn-secondary" onClick={() => void signOut()}>Sign out</button>
  </main>;
}
