import { useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { LayoutContext } from '../ProtectedLayout';

export default function SettingsPage() {
  const { openSettings } = useOutletContext<LayoutContext>();
  const navigate = useNavigate();

  useEffect(() => {
    openSettings();
    // The legacy URL remains usable, but the overlay's background should be
    // the board route so closing it cannot reopen this compatibility entry.
    navigate('/board', { replace: true });
  }, [navigate, openSettings]);

  return null;
}
