import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SettingsPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // The legacy route resolves to the same Board-backed account overlay.
    navigate('/board?account=settings', { replace: true });
  }, [navigate]);

  return null;
}
