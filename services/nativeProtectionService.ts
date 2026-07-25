import { Platform } from 'react-native';

import {
  clearNativeProtection,
  configureNativeProtection,
  getNativeInstallationId,
  getNativeProtectionDiagnostics,
  updateNativeProtectionPreferences,
} from '@/services/hardwareTriggerAdapter';
import {
  isSupabaseConfigured,
  requireSupabase,
  supabaseAnonKey,
  supabaseUrl,
} from '@/services/supabase';

export type NativeProtectionSyncResult = {
  configured: boolean;
  message: string;
};

export async function syncNativeProtection(input: {
  userId: string | null;
  enabled: boolean;
  countdownSeconds: number;
  demoMode: boolean;
}): Promise<NativeProtectionSyncResult> {
  if (Platform.OS !== 'android') return { configured: false, message: 'Android only' };

  if (input.userId && !input.enabled) {
    await revokeNativeProtection();
    return { configured: false, message: 'Protection disabled and device credential revoked' };
  }
  if (!input.userId) {
    await clearNativeProtection();
    return { configured: false, message: 'Sign in required' };
  }
  if (!isSupabaseConfigured) {
    await updateNativeProtectionPreferences(false, input.countdownSeconds, input.demoMode);
    return { configured: false, message: 'Supabase is not configured' };
  }

  const diagnostics = await getNativeProtectionDiagnostics();
  if (
    diagnostics.cloudConfigured &&
    diagnostics.protectionEnabled &&
    diagnostics.configuredUserId === input.userId
  ) {
    await updateNativeProtectionPreferences(true, input.countdownSeconds, input.demoMode);
    return { configured: true, message: 'Native cloud protection ready' };
  }

  const installationId = await getNativeInstallationId();
  if (!installationId) return { configured: false, message: 'Native installation ID unavailable' };
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('manage-native-protection', {
    body: { action: 'register', installationId },
  });
  if (error || typeof data?.deviceId !== 'string' || typeof data?.deviceSecret !== 'string') {
    return { configured: false, message: 'Native protection registration failed' };
  }
  const configured = await configureNativeProtection({
    endpoint: supabaseUrl,
    anonKey: supabaseAnonKey,
    deviceId: data.deviceId,
    deviceSecret: data.deviceSecret,
    userId: input.userId,
    countdownSeconds: input.countdownSeconds,
    demoMode: input.demoMode,
  });
  return {
    configured,
    message: configured ? 'Native cloud protection ready' : 'Native protection bridge unavailable',
  };
}

export async function revokeNativeProtection(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const installationId = await getNativeInstallationId();
  if (installationId && isSupabaseConfigured) {
    const client = requireSupabase();
    await client.functions.invoke('manage-native-protection', {
      body: { action: 'revoke', installationId },
    }).catch(() => undefined);
  }
  await clearNativeProtection();
}
