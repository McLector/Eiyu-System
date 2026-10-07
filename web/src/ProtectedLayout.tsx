import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import ArchiveNotice from './components/ArchiveNotice';
import { NavigationGuard } from './components/NavigationGuard';
import AccountShell, { type AccountOverlay } from './web/AccountShell';
import { useSession } from './store/session-context';
import { DEFAULT_PALETTE, readStoredPaletteChoice } from './palette';
import { useAccountPalette } from './useAccountPalette';
import { useAccountTheme } from './useAccountTheme';

export interface LayoutContext {
  darkMode: boolean;
  onToggleDark: () => void;
  openSettings: () => void;
}

export default function ProtectedLayout() {
  const { session } = useSession();
  const [theme, changeTheme] = useAccountTheme(session?.user.id);
  const darkMode = theme === 'dark';
  const [palette, changePalette] = useAccountPalette(session?.user.id);
  // On the page root, not the shell: dialogs render outside the shell and must agree with the page behind them.
  // Cyan is the absence of the attribute. Leaving the signed-in area restores what a reload would show: index.html paints
  // the stored choice (cyan as no attribute) on the sign-in pages, so this must match it, not a fixed colour.
  useEffect(() => {
    if (palette !== 'cyan') document.documentElement.dataset.palette = palette;
    else delete document.documentElement.dataset.palette;
    return () => {
      const stored = readStoredPaletteChoice();
      if (stored === 'cyan') delete document.documentElement.dataset.palette;
      else document.documentElement.dataset.palette = stored ?? DEFAULT_PALETTE;
    };
  }, [palette]);
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
    onToggleDark: () => changeTheme(darkMode ? 'light' : 'dark'),
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
    <NavigationGuard><div
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
        palette={palette}
        onPaletteChange={changePalette}
      />

      <ArchiveNotice onOpen={() => openOverlay('archived')} />
      {/* Main content */}
      <main className="protected-main" style={{ padding: '12px clamp(12px, 2vw, 28px) 16px' }}>
        <Outlet context={context} />
      </main>
    </div></NavigationGuard>
  );
}
