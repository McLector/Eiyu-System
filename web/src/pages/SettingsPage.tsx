import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { formatError } from '@eiyu/shared';

import WebSettings from '../web/WebSettings';
import { useSession } from '../store/session-context';
import type { LayoutContext } from '../ProtectedLayout';

export default function SettingsPage() {
  const { darkMode, onToggleDark } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();
  const { signOut } = useSession();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleLogout = () => {
    void (async () => {
      setSignOutError(null);
      const { error } = await signOut();
      if (error) setSignOutError(formatError(error));
    })();
  };

  return (
    <WebSettings
      darkMode={darkMode}
      onToggleDark={onToggleDark}
      onShowHistory={() => navigate('/history')}
      onLogout={handleLogout}
      signOutError={signOutError}
    />
  );
}
