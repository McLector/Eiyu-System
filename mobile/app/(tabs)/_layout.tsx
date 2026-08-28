import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';

import { BoardIcon, GearIcon, ScrollIcon, StatusIcon } from '@/components/eiyu/icons';
import { fonts } from '@/constants/eiyu-theme';
import { useEiyu } from '@/contexts/eiyu-store';

export default function TabLayout() {
  const { theme, darkMode } = useEiyu();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.navDim,
        tabBarStyle: {
          position: 'absolute',
          borderTopWidth: 1,
          borderTopColor: theme.navBorder,
          backgroundColor: 'transparent',
          elevation: 0,
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
      <Tabs.Screen
        name="settings"
        options={{
          title: 'SETTINGS',
          tabBarIcon: ({ color }) => <GearIcon color={color} size={22} />,
        }}
      />
    </Tabs>
  );
}
