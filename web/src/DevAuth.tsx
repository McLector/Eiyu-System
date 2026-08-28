import { useState, type FormEvent } from 'react';

import { supabase } from './lib/supabase';

interface Props {
  onAuthenticated: () => void;
}

export default function DevAuth({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: authError } =
        mode === 'login'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (authError) throw authError;
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <h1 style={{ fontFamily: 'Rajdhani', fontSize: 22, color: 'var(--c-text)' }}>
          {mode === 'login' ? 'Sign in' : 'Sign up'} (dev)
        </h1>
        <input
          className="field"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          className="field"
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
        />
        {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
        <button type="submit" className="btn-ghost" disabled={submitting} style={{ padding: '10px' }}>
          {submitting ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
        <button
          type="button"
          onClick={() => setMode(m => (m === 'login' ? 'signup' : 'login'))}
          style={{ background: 'none', border: 'none', color: 'var(--c-accent)', cursor: 'pointer', fontSize: 12 }}
        >
          {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
