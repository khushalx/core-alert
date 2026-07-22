/// <reference types="jest" />

const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockRequireSupabaseForNotifications = jest.fn();

jest.mock('expo-device', () => ({ isDevice: true, deviceName: 'Test phone', modelName: 'Test' }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: 'project-id' } } } } }));
jest.mock('expo-notifications', () => ({
  AndroidImportance: { MAX: 5 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getPermissionsAsync: () => mockGetPermissions(),
  requestPermissionsAsync: () => mockRequestPermissions(),
  getExpoPushTokenAsync: jest.fn(),
  getLastNotificationResponse: jest.fn(() => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('@/services/supabase', () => ({
  requireSupabase: () => mockRequireSupabaseForNotifications(),
  friendlySupabaseError: (_error: unknown, fallback: string) => fallback,
}));

import { registerForPushNotifications } from '@/services/notificationService';

beforeEach(() => { mockGetPermissions.mockReset(); mockRequestPermissions.mockReset(); mockRequireSupabaseForNotifications.mockReset(); });

it('handles notification-permission denial without requesting or storing a token', async () => {
  mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
  mockRequestPermissions.mockResolvedValue({ status: 'denied' });
  await expect(registerForPushNotifications('user-id')).resolves.toEqual({ permission: 'denied', tokenState: 'not-registered', message: 'Notification permission was not granted.' });
  expect(mockRequireSupabaseForNotifications).not.toHaveBeenCalled();
});
