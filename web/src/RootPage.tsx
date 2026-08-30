import { useNavigate, Navigate } from 'react-router-dom';

import { useSession } from './store/session-context';
import Landing from './web/Landing';

// Deliberately reversing a prior ruling: Plan B deleted Landing.tsx because
// there was no deploy target and no audience yet, with an explicit trigger
// for its return — "if the deploy mini-plan later decides this app gets a
// public entry point." That trigger has landed: the app now has a real
// public URL, so a cold, logged-out visit to / gets a real front page
// instead of an immediate bounce to the login form.
export default function RootPage() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  if (loading) return null;
  if (session) return <Navigate to="/board" replace />;
  return <Landing onGetStarted={() => navigate('/auth')} />;
}
