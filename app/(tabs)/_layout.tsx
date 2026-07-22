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
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', paddingTop: 2 },
        tabBarStyle: {
          height: 68,
          paddingTop: 8,
          paddingBottom: 8,
          backgroundColor: colors.white,
          borderTopColor: colors.border,
        },
      }}>
      {(Object.keys(icons) as (keyof typeof icons)[]).map((name) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title: name === 'index' ? 'Home' : name[0].toUpperCase() + name.slice(1),
            tabBarIcon: ({ color, focused, size }) => (
              <Ionicons name={icons[name][focused ? 1 : 0]} color={color} size={size} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
