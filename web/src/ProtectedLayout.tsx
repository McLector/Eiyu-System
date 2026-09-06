import { useState } from 'react';
import { Outlet } from 'react-router-dom';

import Sidebar from './web/Sidebar';

export interface LayoutContext {
  darkMode: boolean;
  onToggleDark: () => void;
}

export default function ProtectedLayout() {
  const [darkMode, setDarkMode] = useState(true);

  const context: LayoutContext = {
    darkMode,
    onToggleDark: () => setDarkMode(d => !d),
  };

  return (
    <div
      data-theme={darkMode ? 'dark' : 'light'}
      className="surface-flat"
      style={{ minHeight: '100svh', position: 'relative' }}
    >
      {/* Fixed flat background (redesign spec §3 — replaces the old gradient) */}
      <div className="surface-flat" style={{ position: 'fixed', inset: 0, zIndex: -1 }} />

      <Sidebar />

      {/* Main content */}
      <main style={{ marginLeft: 220, minHeight: '100svh', padding: '36px 40px' }}>
        <Outlet context={context} />
      </main>
    </div>
  );
}
