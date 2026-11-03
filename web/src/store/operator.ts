import { useCallback, useEffect, useState } from 'react';
import { fetchOperatorStatus, type OperatorStatus } from '@eiyu/shared';

export type OperatorState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; status: OperatorStatus };

/** The caller's own operator status. A failed read is `error`; callers treat it as "not an operator". */
export function useOperatorStatus(userId: string | undefined): OperatorState & { refresh: () => void } {
  const [state, setState] = useState<OperatorState>({ phase: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!userId) { setState({ phase: 'error' }); return; }
    let live = true;
    fetchOperatorStatus(userId)
      .then(status => { if (live) setState({ phase: 'ready', status }); })
      .catch(() => { if (live) setState({ phase: 'error' }); });
    return () => { live = false; };
  }, [userId, tick]);
  const refresh = useCallback(() => setTick(n => n + 1), []);
  return { ...state, refresh };
}
