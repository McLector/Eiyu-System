import { Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import AccountHeader from '@/components/eiyu/account-header';
import { BoardIcon, DumbbellIcon, ScrollIcon, StatusIcon } from '@/components/eiyu/icons';
import { fonts } from '@/constants/eiyu-theme';
import { useTokens } from '@/contexts/theme-store';

export default function TabLayout() {
  const t = useTokens();
  const { fontScale } = useWindowDimensions();
  const scaledTabBarPadding = 24;
  const scaledTabBarHeight = 73 + Math.max(0, Math.ceil((fontScale - 1) * 40));

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => <AccountHeader />,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t['nav-dim'],
        tabBarStyle: {
          position: fontScale > 1.15 ? 'relative' : 'absolute',
          borderTopWidth: 1,
          borderTopColor: t['nav-border'],
          backgroundColor: t.nav,
          elevation: 0,
          ...(fontScale > 1.15
            ? {
                height: scaledTabBarHeight,
                paddingBottom: scaledTabBarPadding,
              }
            : {}),
        },
        tabBarLabelStyle: {
          fontFamily: fonts.displaySemi,
          fontSize: 10,
          letterSpacing: 1,
        },
      }}>
      <Tabs.Screen
        name="board"
        options={{
          title: 'BOARD',
          tabBarIcon: ({ color }) => <BoardIcon color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="status"
        options={{
          title: 'STATUS',
          tabBarIcon: ({ color }) => <StatusIcon color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="chain"
        options={{
          title: 'CHAIN',
          tabBarIcon: ({ color }) => <ScrollIcon color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="gym"
        options={{
          title: 'GYM',
          tabBarIcon: ({ color }) => <DumbbellIcon color={color} size={22} />,
        }}
      />
    </Tabs>
  );
}
