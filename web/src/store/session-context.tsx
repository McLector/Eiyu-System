import { createContext, useContext, type ReactNode } from 'react';
import type { AuthError, Session, User } from '@supabase/supabase-js';

import { useSession as useSessionState } from '../hooks/useSession';
import { supabase } from '../lib/supabase';

interface SessionContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<{ error: AuthError | null }>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useSessionState();

  const signOut = async (): Promise<{ error: AuthError | null }> => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const value: SessionContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    signOut,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession() must be used within a SessionProvider');
  return ctx;
}
