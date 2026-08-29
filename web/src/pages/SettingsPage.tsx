import { useNavigate, useOutletContext } from 'react-router-dom';

import WebSettings from '../web/WebSettings';
import { useSession } from '../store/session-context';
import type { LayoutContext } from '../ProtectedLayout';

export default function SettingsPage() {
  const { darkMode, onToggleDark } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();
  const { signOut } = useSession();

  return (
    <WebSettings
      darkMode={darkMode}
      onToggleDark={onToggleDark}
      onShowHistory={() => navigate('/history')}
      onLogout={() => { void signOut(); }}
    />
  );
}
