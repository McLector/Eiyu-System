import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import ArchiveNotice from './components/ArchiveNotice';
import AccountShell, { type AccountOverlay } from './web/AccountShell';

export interface LayoutContext {
  darkMode: boolean;
  onToggleDark: () => void;
  openSettings: () => void;
}

export default function ProtectedLayout() {
  const [darkMode, setDarkMode] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const requestedOverlay = params.get('account');
  const overlay: AccountOverlay = requestedOverlay === 'profile' || requestedOverlay === 'settings' || requestedOverlay === 'archived'
    ? requestedOverlay : null;

  const openOverlay = (kind: Exclude<AccountOverlay, null>) => {
    const next = new URLSearchParams(location.search);
    next.set('account', kind);
    navigate({ pathname: location.pathname, search: `?${next.toString()}` }, { state: { accountOverlayEntry: true } });
  };

  const context: LayoutContext = {
    darkMode,
    onToggleDark: () => setDarkMode(d => !d),
    openSettings: () => openOverlay('settings'),
  };

  const closeOverlay = () => {
    if (location.state?.accountOverlayEntry) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(location.search);
    next.delete('account');
    navigate({ pathname: location.pathname === '/settings' ? '/board' : location.pathname,
      search: next.toString() ? `?${next.toString()}` : '' }, { replace: true });
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
        onOpenOverlay={openOverlay}
        onCloseOverlay={closeOverlay}
        darkMode={darkMode}
        onToggleDark={context.onToggleDark}
      />

      <ArchiveNotice onOpen={() => openOverlay('archived')} />
      {/* Main content */}
      <main className="protected-main" style={{ padding: '12px clamp(12px, 2vw, 28px) 16px' }}>
        <Outlet context={context} />
      </main>
    </div>
  );
}
