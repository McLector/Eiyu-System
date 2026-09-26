import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { StyleSheet, useWindowDimensions } from 'react-native';

import { BoardIcon, ScrollIcon, StatusIcon } from '@/components/eiyu/icons';
import AccountHeader from '@/components/eiyu/account-header';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';

export default function TabLayout() {
  const { theme, darkMode } = useEiyu();
  const { fontScale } = useWindowDimensions();
  const scaledTabBarPadding = 24;
  const scaledTabBarHeight = 73 + Math.max(0, Math.ceil((fontScale - 1) * 40));

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        header: () => <AccountHeader />,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.navDim,
        tabBarStyle: {
          position: fontScale > 1.15 ? 'relative' : 'absolute',
          borderTopWidth: 1,
          borderTopColor: theme.navBorder,
          backgroundColor: 'transparent',
          elevation: 0,
          ...(fontScale > 1.15
            ? {
                height: scaledTabBarHeight,
                paddingBottom: scaledTabBarPadding,
              }
            : {}),
        },
        tabBarBackground: () => (
          <BlurView
            intensity={40}
            tint={darkMode ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.nav }]}
          />
        ),
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
        name="longquests"
        options={{
          title: 'QUESTS',
          tabBarIcon: ({ color }) => <ScrollIcon color={color} size={22} />,
        }}
      />
    </Tabs>
  );
}
