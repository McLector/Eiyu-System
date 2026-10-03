import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AuthError, Session, User } from '@supabase/supabase-js';
import { formatError } from '@eiyu/shared';

import { useSession as useSessionState } from '../hooks/useSession';
import { supabase } from '../lib/supabase';

interface SessionContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<{ error: AuthError | null }>;
  signOutError: string | null;
  clearSignOutError: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useSessionState();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const currentOwner = useRef(session?.user.id);
  currentOwner.current = session?.user.id;
  useEffect(() => { if (session?.user.id) setSignOutError(null); }, [session?.user.id]);

  const signOut = async (): Promise<{ error: AuthError | null }> => {
    const owner = currentOwner.current;
    const reportError = (error: unknown) => { if (!currentOwner.current || currentOwner.current === owner) setSignOutError(formatError(error)); };
    setSignOutError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) reportError(error);
      return { error };
    } catch (error) { reportError(error); throw error; }
  };

  const value: SessionContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    signOut,
    signOutError,
    clearSignOutError: () => setSignOutError(null),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession() must be used within a SessionProvider');
  return ctx;
}
