import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useBlocker } from 'react-router-dom';
import { NAVIGATION_GUARD_COPY } from '@eiyu/shared';
import Dialog from './Dialog';

interface EditorState { dirty: boolean; pending: boolean; overlay?: boolean }
interface Guard { register: (id: string, state: EditorState | null) => void; request: (action: () => void, state?: EditorState) => void }
const Context = createContext<Guard>({ register: () => {}, request: (action, state) => { if (!state?.pending && !state?.dirty) action(); } });

export function NavigationGuard({ children }: { children: ReactNode }) {
  const editors = useRef(new Map<string, EditorState>());
  const [confirmation, setConfirmation] = useState<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    const routeChange = currentLocation.pathname !== nextLocation.pathname;
    return [...editors.current.values()].some(s => (routeChange || s.overlay) && (s.dirty || s.pending));
  });
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if ([...editors.current.values()].some(s => s.dirty || s.pending)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, []);
  const pending = [...editors.current.values()].some(s => s.pending);
  const request = (action: () => void, state?: EditorState) => {
    const states = state ? [state] : [...editors.current.values()];
    if (states.some(s => s.pending)) { setBusy(true); return; }
    if (states.some(s => s.dirty)) setConfirmation(() => action); else action();
  };
  const blocked = blocker.state === 'blocked';
  const cancel = () => { setConfirmation(null); setBusy(false); if (blocker.state === 'blocked') blocker.reset(); };
  return <Context.Provider value={{ register: (id, state) => { if (state) editors.current.set(id, state); else editors.current.delete(id); }, request }}>
    {children}
    {(blocked || confirmation || busy) && <Dialog title={pending || busy ? NAVIGATION_GUARD_COPY.busyTitle : NAVIGATION_GUARD_COPY.leaveTitle} onClose={cancel}>
      <p>{pending || busy ? NAVIGATION_GUARD_COPY.busyBody : NAVIGATION_GUARD_COPY.leaveBody}</p>
      <div className="action-footer"><button className="btn-secondary" onClick={cancel}>Keep editing</button>
        {!pending && !busy && <button className="btn-destructive" onClick={() => { const action = confirmation; setConfirmation(null); if (blocker.state === 'blocked') blocker.proceed(); else action?.(); }}>Leave without saving</button>}
      </div>
    </Dialog>}
  </Context.Provider>;
}

export function useEditorGuard(dirty: boolean, pending = false, overlay = false) {
  const guard = useContext(Context);
  const id = useId();
  const register = guard.register;
  useEffect(() => { register(id, { dirty, pending, overlay }); return () => register(id, null); }, [register, id, dirty, pending, overlay]);
  const request = (action: () => void) => guard.request(action, { dirty, pending, overlay });
  return Object.assign(request, { committed: (action: () => void) => { register(id, null); action(); } });
}
export function useNavigationGuard() { return useContext(Context).request; }
