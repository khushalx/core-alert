import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors } from '@/constants/theme';

const icons = {
  index: ['home-outline', 'home'] as const,
  guardians: ['people-outline', 'people'] as const,
  activity: ['time-outline', 'time'] as const,
  settings: ['settings-outline', 'settings'] as const,
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.red,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', paddingTop: 1 },
        tabBarStyle: {
          height: 72,
          paddingTop: 9,
          paddingBottom: 9,
          backgroundColor: colors.backgroundSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
        },
        tabBarItemStyle: { borderRadius: 14 },
      }}>
      {(Object.keys(icons) as (keyof typeof icons)[]).map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: name === 'index' ? 'Home' : name[0].toUpperCase() + name.slice(1),
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={icons[name][focused ? 1 : 0]} color={color} size={22} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
