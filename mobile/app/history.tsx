import { router } from 'expo-router';

import { HistorySheet } from '@/components/status/history-sheet';
import { useAuth } from '@/contexts/auth-store';
import { useEiyu } from '@/contexts/eiyu-store';

/** The History route: the calendar sheet over whatever opened it, closing back to it. */
export default function HistoryScreen() {
  const { user } = useEiyu();
  const { session } = useAuth();
  return <HistorySheet visible userId={session?.user.id} timeZone={user.timeZone} onClose={() => router.back()} />;
}
