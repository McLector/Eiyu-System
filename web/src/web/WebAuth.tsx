import { useState } from 'react';

import { supabase } from '../lib/supabase';
import {
  passwordStrength,
  validateConfirmPassword,
  validateDisplayName,
  validateEmail,
  validatePassword,
} from '@eiyu/shared';

type Mode = 'login' | 'signup' | 'forgot';

interface Props { onLogin: () => void; }

interface Notice { emoji: string; title: string; message: string; }

const STRENGTH_LABELS = ['Weak', 'Okay', 'Good', 'Strong'] as const;
const STRENGTH_COLORS = ['#f87171', '#fbbf24', '#4ade80', '#4ade80'] as const;

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordStrength(password);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
        {[1,2,3].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= score ? STRENGTH_COLORS[score] : 'var(--c-glass-border)', transition: 'background 0.2s' }} />
        ))}
      </div>
      <span style={{ fontFamily: 'Inter', fontSize: 11, color: STRENGTH_COLORS[score] }}>{STRENGTH_LABELS[score]}</span>
    </div>
  );
}

export default function WebAuth({ onLogin }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [name, setName] = useState('');
  const [terms, setTerms] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Switch auth mode without leaking submit-state, stale errors, or secrets
   * across forms. Password/confirm/terms are cleared deliberately: a login-
   * typed password silently pre-filling signup would let an account be created
   * with a secret the user never knowingly entered there, and a ticked terms
   * box carried across modes would record an acknowledgement that never
   * happened. Email is kept on purpose — it's the same person registering.
   * Mirrors mobile/app/auth.tsx's switchMode, which documents the same bug
   * found live on-device. */
  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword('');
    setConfirmPw('');
    setTerms(false);
  };

  const emailError = validateEmail(email);
  const passwordError = mode !== 'forgot' ? validatePassword(password) : null;
  const nameError = mode === 'signup' ? validateDisplayName(name) : null;
  const confirmError = mode === 'signup' ? validateConfirmPassword(password, confirmPw) : null;

  const valid =
    mode === 'forgot'
      ? !emailError
      : mode === 'login'
        ? !emailError && !passwordError
        : !emailError && !nameError && !passwordError && !confirmError && terms;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (resetError) throw resetError;
        setNotice({ emoji: '📧', title: 'Recovery Link Sent', message: `Check ${email.trim()} for instructions` });
        return;
      }
      if (mode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() } },
        });
        if (authError) throw authError;
        if (!data.session) {
          setNotice({
            emoji: '✅',
            title: 'Confirm Your Email',
            message: `We sent a confirmation link to ${email.trim()}. Sign in once you've confirmed.`,
          });
          return;
        }
        onLogin();
        return;
      }
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', position: 'relative' }}>
      {/* Radial glow */}
      <div style={{ position: 'fixed', top: '30%', left: '50%', transform: 'translateX(-50%)', width: 400, height: 400, background: 'radial-gradient(circle, var(--c-accent-glass) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }} />

      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
            background: 'var(--c-accent-glass)', border: '1.5px solid var(--c-accent-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px var(--c-accent-glass)',
          }}>
            <span style={{ fontFamily: 'Rajdhani', fontSize: 24, fontWeight: 700, color: 'var(--c-accent)' }}>英</span>
          </div>
          <h1 style={{ fontFamily: 'Rajdhani', fontSize: 28, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.1em', margin: 0 }}>EIYU SYSTEM</h1>
          <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted)', marginTop: 6 }}>
            {mode === 'login' ? 'Enter the system' : mode === 'signup' ? 'Begin your journey' : 'Reset access'}
          </p>
        </div>

        {/* Card */}
        <div className="glass" style={{ padding: '28px 28px 24px' }}>
          {/* Accent line */}
          <div style={{ height: 2, background: 'var(--c-accent)', borderRadius: 1, marginBottom: 22, opacity: 0.7 }} />

          {notice ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>{notice.emoji}</div>
              <p style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 700, color: 'var(--c-accent)', marginBottom: 6 }}>{notice.title}</p>
              <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted)', marginBottom: 20 }}>{notice.message}</p>
              <button onClick={() => { setNotice(null); switchMode('login'); }} className="btn-ghost" style={{ width: '100%', padding: '13px', fontFamily: 'Rajdhani', fontSize: 15, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.08em' }}>
                BACK TO LOGIN
              </button>
            </div>
          ) : (
            <form onSubmit={e => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {mode === 'signup' && (
                <div>
                  <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted)', display: 'block', marginBottom: 7 }}>DISPLAY NAME</label>
                  <input className="field" placeholder="Kaito Mizuru" value={name} onChange={e => setName(e.target.value)} />
                </div>
              )}
              <div>
                <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted)', display: 'block', marginBottom: 7 }}>EMAIL</label>
                <input className="field" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              {mode !== 'forgot' && (
                <div>
                  <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted)', display: 'block', marginBottom: 7 }}>PASSWORD</label>
                  <input className="field" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
                  {mode === 'signup' && <PasswordStrength password={password} />}
                </div>
              )}
              {mode === 'signup' && (
                <div>
                  <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted)', display: 'block', marginBottom: 7 }}>CONFIRM PASSWORD</label>
                  <input className="field" type="password" placeholder="••••••••" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                  {confirmPw.length > 0 && confirmPw !== password && (
                    <p style={{ fontFamily: 'Inter', fontSize: 11, color: '#f87171', marginTop: 6 }}>Passwords don&apos;t match</p>
                  )}
                </div>
              )}
              {mode === 'signup' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <div
                    onClick={() => setTerms(!terms)}
                    style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                      border: `1.5px solid ${terms ? 'rgba(74,222,128,0.5)' : 'var(--c-accent-border)'}`,
                      background: terms ? 'rgba(74,222,128,0.15)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                  >
                    {terms && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                  </div>
                  <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-muted)' }}>
                    I agree to the{' '}
                    <span style={{ color: 'var(--c-accent)', textDecoration: 'underline', cursor: 'pointer' }}>Privacy Policy & Terms</span>
                  </span>
                </label>
              )}
              {mode === 'login' && (
                <div style={{ textAlign: 'right', marginTop: -4 }}>
                  <button type="button" onClick={() => switchMode('forgot')} style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Forgot password?
                  </button>
                </div>
              )}
              {error && <p style={{ fontFamily: 'Inter', fontSize: 12, color: '#f87171' }}>{error}</p>}
              <button type="submit" disabled={!valid || submitting} className="btn-ghost" style={{ width: '100%', padding: '14px', marginTop: 4, fontFamily: 'Rajdhani', fontSize: 16, fontWeight: 700, color: 'var(--c-accent)', letterSpacing: '0.1em', opacity: !valid || submitting ? 0.6 : 1 }}>
                {submitting ? 'WORKING…' : mode === 'login' ? 'ENTER SYSTEM' : mode === 'signup' ? 'BEGIN JOURNEY' : 'SEND RECOVERY LINK'}
              </button>
            </form>
          )}
        </div>

        {/* Switch mode */}
        {!notice && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 18 }}>
            <span style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-dim)' }}>
              {mode === 'login' ? 'New adventurer?' : mode === 'signup' ? 'Already enrolled?' : ''}
            </span>
            {mode !== 'forgot' && (
              <button onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')} style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                {mode === 'login' ? 'Register' : 'Sign in'}
              </button>
            )}
            {mode === 'forgot' && (
              <button onClick={() => switchMode('login')} style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Back to login
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
