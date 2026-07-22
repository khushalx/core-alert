import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SosOverlay } from '@/components/SosOverlay';
import { Toast } from '@/components/ui';
import { colors } from '@/constants/theme';
import { AppProvider } from '@/store/AppContext';
import { AuthProvider } from '@/store/AuthContext';
import { ConnectedProvider } from '@/store/ConnectedContext';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppProvider>
        <ConnectedProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShadowVisible: false,
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.navy,
              headerTitleStyle: { color: colors.text, fontWeight: '700' },
              contentStyle: { backgroundColor: colors.background },
            }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
            <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
            <Stack.Screen name="forgot-password" options={{ title: 'Reset password' }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="guardian-form" options={{ title: 'Guardian details', presentation: 'modal' }} />
            <Stack.Screen name="guardian/[id]" options={{ title: 'Guardian' }} />
            <Stack.Screen name="guardian-requests" options={{ title: 'Guardian requests' }} />
            <Stack.Screen name="enter-invite-code" options={{ title: 'Enter invite code' }} />
            <Stack.Screen name="people-i-protect" options={{ title: 'People I protect' }} />
            <Stack.Screen name="guardian-incident/[id]" options={{ title: 'Active SOS' }} />
            <Stack.Screen name="location-details" options={{ title: 'Location' }} />
            <Stack.Screen name="emergency-profile" options={{ title: 'Emergency profile' }} />
            <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
            <Stack.Screen name="shortcut-tutorial" options={{ title: 'How the shortcut works' }} />
            <Stack.Screen name="hardware-diagnostics" options={{ title: 'Diagnostics' }} />
            <Stack.Screen name="incident/[id]" options={{ title: 'Incident details' }} />
          </Stack>
          <SosOverlay />
          <Toast />
        </ConnectedProvider>
      </AppProvider>
    </AuthProvider>
  );
}
