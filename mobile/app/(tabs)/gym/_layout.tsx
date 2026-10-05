import { Stack } from 'expo-router';

import { useTokens } from '@/contexts/theme-store';

/** The Gym tab is a list that opens an exercise card or the workout history; the tab's own header stays above all of them. */
export default function GymLayout() {
  const t = useTokens();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t['page-flat'] } }} />;
}
