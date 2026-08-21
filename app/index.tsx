import { Redirect } from 'expo-router';

import { useAuth } from '@/contexts/auth-store';

export default function Index() {
  const { session, loading } = useAuth();
  if (loading) return null;
  return <Redirect href={session ? '/(tabs)/board' : '/auth'} />;
}
