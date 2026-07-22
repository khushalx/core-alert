import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { friendlySupabaseError, requireSupabase } from '@/services/supabase';
import type { NotificationPermissionState } from '@/types/cloud';

export type PushRegistrationResult = {
  permission: NotificationPermissionState;
  tokenState: 'not-registered' | 'registered' | 'error';
  message: string;
};

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  if (Platform.OS === 'web') return 'unavailable';
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status === 'granted') return 'granted';
  if (permission.status === 'denied') return 'denied';
  return 'unknown';
}

export async function registerForPushNotifications(userId: string): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web' || !Device.isDevice) {
    return { permission: 'unavailable', tokenState: 'not-registered', message: 'Push notifications require a physical development-build device.' };
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('sos-alerts', {
      name: 'SOS alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 150, 250],
      lightColor: '#D92D20',
    });
  }

  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') {
    return { permission: 'denied', tokenState: 'not-registered', message: 'Notification permission was not granted.' };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    return { permission: 'granted', tokenState: 'error', message: 'Add the EAS project ID before registering a push token.' };
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const client = requireSupabase();
    const { error } = await client.from('device_push_tokens').upsert({
      user_id: userId,
      expo_push_token: token,
      platform: Platform.OS,
      device_name: Device.deviceName ?? Device.modelName ?? null,
      is_active: true,
    }, { onConflict: 'user_id,expo_push_token' });
    if (error) throw error;
    return { permission: 'granted', tokenState: 'registered', message: 'This device is ready for Core Alert notifications.' };
  } catch (error) {
    return { permission: 'granted', tokenState: 'error', message: friendlySupabaseError(error, 'The push token could not be registered.') };
  }
}

export async function deactivatePushTokens(userId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('device_push_tokens').update({ is_active: false }).eq('user_id', userId);
  if (error && __DEV__) console.warn('Push tokens could not be deactivated', error.message);
}

export function installNotificationObservers(onIncidentUrl: (url: string) => void): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const redirect = (notification: Notifications.Notification) => {
    const url = notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/guardian-incident/')) onIncidentUrl(url);
  };
  const lastResponse = Notifications.getLastNotificationResponse();
  if (lastResponse?.notification) redirect(lastResponse.notification);
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => redirect(response.notification));
  return () => responseSubscription.remove();
}
