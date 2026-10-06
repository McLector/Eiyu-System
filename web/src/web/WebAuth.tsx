import { useState } from 'react';
import Dialog from '../components/Dialog';

import { supabase } from '../lib/supabase';
import {
  authErrorMessage,
  confirmEmailMessage,
  LEGAL_DOCUMENTS,
  MIN_PASSWORD_LENGTH,
  normalizeNameBoundaries,
  passwordStrength,
  resetLinkSentMessage,
  validateConfirmPassword,
  validateDisplayName,
  validateEmail,
  validatePassword,
  deviceTimeZone,
  type AuthMode,
  type LegalDocumentId,
} from '@eiyu/shared';

import { CheckIcon, MailIcon } from '../Icons';
import { PasswordInput } from '../components/PasswordInput';
import SignaturePanel from '../SignaturePanel';

interface Props { onLogin: () => void; logoutWarning?: string | null; onDismissLogoutWarning?: () => void; }

interface Notice { icon: 'mail' | 'check'; title: string; message: string; }

const STRENGTH_LABELS = ['Weak', 'Okay', 'Good', 'Strong'] as const;
const STRENGTH_COLORS = ['var(--c-danger)', 'var(--c-warning)', 'var(--c-success)', 'var(--c-success)'] as const;

const NOTICE_TINT = {
  mail: { bg: 'var(--c-accent-glass)', border: 'var(--c-accent-border)', color: 'var(--c-accent-text)' },
  check: { bg: 'var(--c-success-glass)', border: 'var(--c-success-border)', color: 'var(--c-success)' },
} as const;

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordStrength(password);
  const label = password.length < MIN_PASSWORD_LENGTH ? 'Too short' : STRENGTH_LABELS[score];
  const color = password.length < MIN_PASSWORD_LENGTH ? 'var(--c-danger)' : STRENGTH_COLORS[score];
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= score ? STRENGTH_COLORS[score] : 'var(--c-glass-border)', transition: 'background-color var(--dur-base) ease' }} />
        ))}
      </div>
      <span style={{ fontFamily: 'Inter', fontSize: 11, color }}>{label}</span>
    </div>
  );
}

function NoticeBadge({ icon }: { icon: Notice['icon'] }) {
  const tint = NOTICE_TINT[icon];
  return (
    <div style={{
      width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
      background: tint.bg, border: `1.5px solid ${tint.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: tint.color,
    }}>
      {icon === 'mail' ? <MailIcon size={24} color={tint.color} /> : <CheckIcon size={24} />}
    </div>
  );
}

export default function WebAuth({ onLogin, logoutWarning, onDismissLogoutWarning }: Props) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [name, setName] = useState('');
  const [terms, setTerms] = useState(false);
  const [legalDocument, setLegalDocument] = useState<LegalDocumentId | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeLegalDocument = legalDocument ? LEGAL_DOCUMENTS[legalDocument] : null;
  const openLegalDocument = (id: LegalDocumentId) => setLegalDocument(id);

  /** Switch auth mode without leaking submit-state, stale errors, or secrets
   * across forms. Password/confirm/terms are cleared deliberately: a login-
   * typed password silently pre-filling signup would let an account be created
   * with a secret the user never knowingly entered there, and a ticked terms
   * box carried across modes would record an acknowledgement that never
   * happened. Email is kept on purpose — it's the same person registering.
   * Mirrors mobile/app/auth.tsx's switchMode, which documents the same bug
   * found live on-device. */
  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setAttempted(false);
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
    setAttempted(true);
    if (!valid || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (resetError) throw resetError;
        setNotice({ icon: 'mail', title: 'MESSAGE DISPATCHED', message: resetLinkSentMessage(email.trim()) });
        return;
      }
      if (mode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: normalizeNameBoundaries(name), time_zone: deviceTimeZone() } },
        });
        if (authError) throw authError;
        if (!data.session) {
          setNotice({ icon: 'check', title: 'ALMOST THERE', message: confirmEmailMessage(email.trim()) });
          return;
        }
        onLogin();
        return;
      }
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      onLogin();
    } catch (err) {
      setError(authErrorMessage(mode, err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="surface-flat" style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', position: 'relative' }}>
      <div
        aria-hidden={activeLegalDocument ? true : undefined}
        style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
            background: 'var(--c-accent-glass)', border: '1.5px solid var(--c-accent-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 24px var(--c-accent-glass)',
          }}>
            <span style={{ fontFamily: 'Rajdhani', fontSize: 24, fontWeight: 700, color: 'var(--c-accent-text)' }}>英</span>
          </div>
          <h1 style={{ fontFamily: 'Rajdhani', fontSize: 28, fontWeight: 700, color: 'var(--c-text)', letterSpacing: '0.1em', margin: 0 }}>EIYU SYSTEM</h1>
          <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted-flat)', marginTop: 6 }}>
            {mode === 'login' ? 'Enter the system' : mode === 'signup' ? 'Begin your journey' : 'Reset access'}
          </p>
        </div>

        {/* Card — the only signature panel on this screen (spec 8.4) */}
        <SignaturePanel style={{ padding: '28px 28px 24px' }}>
          {logoutWarning && <div className="auth-signout-warning" role="alert">
            <p>Signed out on this device. Server sign-out could not be confirmed: {logoutWarning}</p>
            <button type="button" className="phase4-close" aria-label="Dismiss sign-out warning" onClick={onDismissLogoutWarning}>×</button>
          </div>}
          {/* Accent line */}
          <div style={{ height: 2, background: 'var(--c-accent)', borderRadius: 1, marginBottom: 22, opacity: 0.7 }} />

          {notice ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <NoticeBadge icon={notice.icon} />
              <p style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 700, color: 'var(--c-accent-text)', marginBottom: 6, letterSpacing: '0.04em' }}>{notice.title}</p>
              <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-muted-flat)', marginBottom: 20 }}>{notice.message}</p>
              <button onClick={() => { setNotice(null); switchMode('login'); }} className="btn-secondary" style={{ width: '100%' }}>
                BACK TO LOGIN
              </button>
            </div>
          ) : (
            <form onSubmit={e => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {mode === 'signup' && (
                <div>
                  <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted-flat)', display: 'block', marginBottom: 7 }}>DISPLAY NAME</label>
                  <input aria-label="Display name" aria-invalid={attempted && !!nameError} aria-describedby={attempted && nameError ? 'signup-name-error' : undefined} className="field" placeholder="Kaito Mizuru" value={name} onChange={e => setName(e.target.value)} />
                  {attempted && nameError && <p id="signup-name-error" role="alert" aria-live="polite" style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-danger)', margin: '6px 0 0' }}>{nameError}</p>}
                </div>
              )}
              <div>
                <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted-flat)', display: 'block', marginBottom: 7 }}>EMAIL</label>
                <input aria-label="Email address" aria-invalid={attempted && !!emailError} aria-describedby={attempted && emailError ? 'auth-email-error' : undefined} className="field" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
                {attempted && emailError && <p id="auth-email-error" role="alert" aria-live="polite" style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-danger)', margin: '6px 0 0' }}>{emailError}</p>}
              </div>
              {mode !== 'forgot' && (
                <div>
                  <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted-flat)', display: 'block', marginBottom: 7 }}>PASSWORD</label>
                  <PasswordInput key={mode} aria-label="Password" aria-invalid={attempted && !!passwordError} aria-describedby={attempted && passwordError ? 'auth-password-error' : undefined} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
                  {attempted && passwordError && <p id="auth-password-error" role="alert" aria-live="polite" style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-danger)', margin: '6px 0 0' }}>{passwordError}</p>}
                  {mode === 'signup' && <PasswordStrength password={password} />}
                </div>
              )}
              {mode === 'signup' && (
                <div>
                  <label style={{ fontFamily: 'Rajdhani', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--c-muted-flat)', display: 'block', marginBottom: 7 }}>CONFIRM PASSWORD</label>
                  <PasswordInput toggleLabel="confirm password" aria-label="Confirm password" placeholder="••••••••" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                  {attempted && confirmError && <p id="signup-confirm-error" role="alert" aria-live="polite" style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-danger)', marginTop: 6 }}>{confirmError}</p>}
                </div>
              )}
              {mode === 'signup' && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={terms}
                    aria-label="I agree to the Privacy Policy & Terms"
                    onClick={() => setTerms(!terms)}
                    style={{
                      width: 18, height: 18, borderRadius: 5, flexShrink: 0, padding: 0,
                      border: `1.5px solid ${terms ? 'var(--c-success-border)' : 'var(--c-accent-border)'}`,
                      background: terms ? 'var(--c-success-glass)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background-color var(--dur-fast) ease, border-color var(--dur-fast) ease, color var(--dur-fast) ease', color: 'var(--c-success)', cursor: 'pointer',
                    }}
                  >
                    {terms && <CheckIcon size={11} />}
                  </button>
                  <span style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-muted-flat)', lineHeight: 1.6 }}>
                    I agree to the{' '}
                    <button
                      type="button"
                      onClick={() => openLegalDocument('privacy')}
                      style={{ padding: 0, border: 0, background: 'none', color: 'var(--c-accent-text)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                      Privacy Policy
                    </button>{' '}
                    and{' '}
                    <button
                      type="button"
                      onClick={() => openLegalDocument('terms')}
                      style={{ padding: 0, border: 0, background: 'none', color: 'var(--c-accent-text)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                      Terms of Use
                    </button>.
                  </span>
                  {attempted && !terms && <span role="alert" aria-live="polite" style={{ fontFamily: 'Inter', fontSize: 11, color: 'var(--c-danger)' }}>Accept the Privacy Policy and Terms to continue.</span>}
                </div>
              )}
              {mode === 'login' && (
                <div style={{ textAlign: 'right', marginTop: -4 }}>
                  <button type="button" onClick={() => switchMode('forgot')} style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-dim-flat)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Forgot password?
                  </button>
                </div>
              )}
              {error && <p style={{ fontFamily: 'Inter', fontSize: 12, color: 'var(--c-danger)' }}>{error}</p>}
              <button type="submit" disabled={submitting} className="btn-primary" style={{ width: '100%', marginTop: 4, minHeight: 46, fontSize: 16 }}>
                {submitting ? 'WORKING…' : mode === 'login' ? 'ENTER SYSTEM' : mode === 'signup' ? 'BEGIN JOURNEY' : 'SEND RECOVERY LINK'}
              </button>
            </form>
          )}
        </SignaturePanel>

        {/* Switch mode */}
        {!notice && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 18 }}>
            <span style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-dim-flat)' }}>
              {mode === 'login' ? 'New adventurer?' : mode === 'signup' ? 'Already enrolled?' : ''}
            </span>
            {mode !== 'forgot' && (
              <button onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')} style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-accent-text)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                {mode === 'login' ? 'Register' : 'Sign in'}
              </button>
            )}
            {mode === 'forgot' && (
              <button onClick={() => switchMode('login')} style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--c-accent-text)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Back to login
              </button>
            )}
          </div>
        )}
      </div>

      {activeLegalDocument && (
        <Dialog title={activeLegalDocument.title} onClose={() => setLegalDocument(null)}>
            <div
              tabIndex={0}
              aria-label={`${activeLegalDocument.title} content`}
              style={{ paddingRight: 8 }}>
              {activeLegalDocument.sections.map(section => (
                <section key={section.heading} style={{ marginBottom: 20 }}>
                  <h3 style={{ margin: '0 0 7px', fontFamily: 'Rajdhani', fontSize: 13, color: 'var(--c-accent-text)', letterSpacing: '0.1em' }}>
                    {section.heading}
                  </h3>
                  <p style={{ margin: 0, fontFamily: 'Inter', fontSize: 14, lineHeight: 1.75, color: 'var(--c-muted-flat)', overflowWrap: 'anywhere' }}>
                    {section.body}
                  </p>
                </section>
              ))}
            </div>
        </Dialog>
      )}
    </div>
  );
}
