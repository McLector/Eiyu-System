import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';

export function useSession(): { session: Session | null; loading: boolean } {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Guards against a stale getSession() resolution clobbering a newer
  // session that onAuthStateChange already delivered — the live
  // subscription's value always wins over the initial read.
  const authStateArrived = useRef(false);

  useEffect(() => {
    authStateArrived.current = false;

    supabase.auth.getSession().then(({ data }) => {
      if (authStateArrived.current) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      authStateArrived.current = true;
      setSession(newSession);
      setLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, loading };
}
