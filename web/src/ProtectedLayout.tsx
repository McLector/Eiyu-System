import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import AccountShell, { type AccountOverlay } from './web/AccountShell';

export interface LayoutContext {
  darkMode: boolean;
  onToggleDark: () => void;
  openSettings: () => void;
}

export default function ProtectedLayout() {
  const [darkMode, setDarkMode] = useState(true);
  const [overlay, setOverlay] = useState<AccountOverlay>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const context: LayoutContext = {
    darkMode,
    onToggleDark: () => setDarkMode(d => !d),
    openSettings: () => setOverlay('settings'),
  };

  const closeOverlay = () => {
    setOverlay(null);
    if (location.pathname === '/settings') navigate('/board', { replace: true });
  };

  return (
    <div
      data-theme={darkMode ? 'dark' : 'light'}
      className="surface-flat"
      style={{ minHeight: '100svh', position: 'relative' }}
    >
      {/* Fixed flat background (redesign spec §3 — replaces the old gradient) */}
      <div className="surface-flat" style={{ position: 'fixed', inset: 0, zIndex: -1 }} />

      <AccountShell
        overlay={overlay}
        onOpenOverlay={setOverlay}
        onCloseOverlay={closeOverlay}
        darkMode={darkMode}
        onToggleDark={context.onToggleDark}
      />

      {/* Main content */}
      <main style={{ minHeight: '100svh', padding: '24px clamp(16px, 4vw, 56px) 48px' }}>
        <Outlet context={context} />
      </main>
    </div>
  );
}
