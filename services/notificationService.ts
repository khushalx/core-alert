import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { friendlySupabaseError, requireSupabase } from '@/services/supabase';
import { acknowledgeIncidentFromNotification } from '@/services/incidentService';
import type { NotificationPermissionState } from '@/types/cloud';

export type PushRegistrationResult = {
  permission: NotificationPermissionState;
  tokenState: 'not-registered' | 'registered' | 'error';
  message: string;
};

export const SOS_CHANNEL_ID = 'guardian-sos-alerts-v3';
export const SOS_CATEGORY_ID = 'CORE_ALERT_SOS';
export const RESPONDING_ACTION = 'CORE_ALERT_RESPONDING';
export const CANNOT_RESPOND_ACTION = 'CORE_ALERT_CANNOT_RESPOND';
export const OPEN_LOCATION_ACTION = 'CORE_ALERT_OPEN_LOCATION';
const BACKGROUND_NOTIFICATION_TASK = 'CORE_ALERT_NOTIFICATION_ACTION_TASK';
const handledNotificationResponses = new Set<string>();
const registrationAttempts = new Map<string, Promise<PushRegistrationResult>>();

type NotificationTaskBody = {
  notification?: Notifications.Notification;
  actionIdentifier?: string;
};

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(BACKGROUND_NOTIFICATION_TASK)) {
  TaskManager.defineTask<NotificationTaskBody>(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error || !data?.notification) return;
    await handleNotificationAction(data.notification, data.actionIdentifier).catch(() => undefined);
  });
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data;
      const isGuardianSos =
        data?.notificationType === 'guardian_sos' &&
        data?.recipientRole === 'guardian';
      return {
        shouldPlaySound: isGuardianSos,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
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
  const existingAttempt = registrationAttempts.get(userId);
  if (existingAttempt) return existingAttempt;
  const attempt = performPushRegistration(userId);
  registrationAttempts.set(userId, attempt);
  try {
    return await attempt;
  } finally {
    registrationAttempts.delete(userId);
  }
}

async function performPushRegistration(userId: string): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web' || !Device.isDevice) {
    return { permission: 'unavailable', tokenState: 'not-registered', message: 'Push notifications require a physical development-build device.' };
  }
  if (Platform.OS === 'android') {
    await configureGuardianNotifications();
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
    await savePushToken(userId, token);
    return { permission: 'granted', tokenState: 'registered', message: 'This device is ready for Core Alert notifications.' };
  } catch (error) {
    return {
      permission: 'granted',
      tokenState: 'error',
      message: friendlySupabaseError(
        error,
        'Push registration failed. Install an Android build configured with Firebase Cloud Messaging and try again.',
      ),
    };
  }
}

async function savePushToken(userId: string, token: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('device_push_tokens').upsert({
    user_id: userId,
    expo_push_token: token,
    platform: Platform.OS,
    device_name: Device.deviceName ?? Device.modelName ?? null,
    is_active: true,
  }, { onConflict: 'user_id,expo_push_token' });
  if (error) throw error;
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
  const handleResponse = (response: Notifications.NotificationResponse) => {
    const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (handledNotificationResponses.has(responseKey)) return;
    handledNotificationResponses.add(responseKey);
    void handleNotificationAction(response.notification, response.actionIdentifier);
    if (
      response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER ||
      response.actionIdentifier === OPEN_LOCATION_ACTION
    ) {
      redirect(response.notification);
    }
  };
  const lastResponse = Notifications.getLastNotificationResponse();
  if (lastResponse) {
    handleResponse(lastResponse);
    Notifications.clearLastNotificationResponse();
  }
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
    handleResponse(response);
  });
  return () => responseSubscription.remove();
}

export function installPushTokenObserver(userId: string): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const subscription = Notifications.addPushTokenListener((token) => {
    if (token.type !== 'expo') return;
    void savePushToken(userId, token.data).catch((error) => {
      if (__DEV__) console.warn('Rotated push token could not be saved', error instanceof Error ? error.message : 'unknown');
    });
  });
  return () => subscription.remove();
}

export async function configureGuardianNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(SOS_CHANNEL_ID, {
      name: 'Emergency SOS alerts',
      description: 'Loud SOS alerts from people you protect',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 500, 180, 500, 180, 700],
      lightColor: '#D92D20',
      enableLights: true,
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });
  }
  await Notifications.setNotificationCategoryAsync(SOS_CATEGORY_ID, [
    {
      identifier: RESPONDING_ACTION,
      buttonTitle: 'I’m responding',
      options: { opensAppToForeground: false },
    },
    {
      identifier: CANNOT_RESPOND_ACTION,
      buttonTitle: 'Can’t respond',
      options: { opensAppToForeground: false },
    },
    {
      identifier: OPEN_LOCATION_ACTION,
      buttonTitle: 'View location',
      options: { opensAppToForeground: true },
    },
  ]);
  const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
  if (!registered) {
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => undefined);
  }
}

async function handleNotificationAction(
  notification: Notifications.Notification,
  actionIdentifier?: string,
): Promise<void> {
  const incidentId = notification.request.content.data?.incidentId;
  if (typeof incidentId !== 'string') return;
  const response = actionIdentifier === RESPONDING_ACTION
    ? 'responding'
    : actionIdentifier === CANNOT_RESPOND_ACTION
      ? 'cannot_respond'
      : actionIdentifier === OPEN_LOCATION_ACTION
        ? 'open_location'
        : null;
  if (!response) return;
  await acknowledgeIncidentFromNotification(incidentId, response);
}
