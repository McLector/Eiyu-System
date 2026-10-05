import { Stack } from 'expo-router';

import { useTokens } from '@/contexts/theme-store';

/** The Chain tab is a list that opens one chain; the tab's own header stays above both. */
export default function ChainLayout() {
  const t = useTokens();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t['page-flat'] } }} />;
}
