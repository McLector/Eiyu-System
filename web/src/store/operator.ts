import { useCallback, useEffect, useState } from 'react';
import { fetchOperatorStatus, type OperatorStatus } from '@eiyu/shared';

export type OperatorState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; status: OperatorStatus };

/** The caller's own operator status. A failed read is `error`; callers treat it as "not an operator". */
export function useOperatorStatus(userId: string | undefined): OperatorState & { refresh: () => void } {
  // Each answer records whose it is, so nothing is shown for a different account, even for one render after a switch.
  const [state, setState] = useState<{ owner: string | undefined; value: OperatorState }>({ owner: userId, value: { phase: 'loading' } });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!userId) { setState({ owner: userId, value: { phase: 'error' } }); return; }
    let live = true;
    fetchOperatorStatus(userId)
      .then(status => { if (live) setState({ owner: userId, value: { phase: 'ready', status } }); })
      .catch(() => { if (live) setState({ owner: userId, value: { phase: 'error' } }); });
    return () => { live = false; };
  }, [userId, tick]);
  const refresh = useCallback(() => setTick(n => n + 1), []);
  return { ...(state.owner === userId ? state.value : { phase: 'loading' }), refresh };
}
