import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import type { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

export const isSupabaseConfigured = /^https:\/\/.+\.supabase\.co$/i.test(supabaseUrl) && supabaseAnonKey.length > 20;

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        lock: processLock,
      },
    })
  : null;

let refreshListenerInstalled = false;

export function installSupabaseAppStateRefresh(): () => void {
  if (!supabase || Platform.OS === 'web' || refreshListenerInstalled) return () => undefined;
  refreshListenerInstalled = true;
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
  if (AppState.currentState === 'active') supabase.auth.startAutoRefresh();
  return () => {
    subscription.remove();
    supabase.auth.stopAutoRefresh();
    refreshListenerInstalled = false;
  };
}

export function requireSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    throw new Error('SUPABASE_NOT_CONFIGURED');
  }
  return supabase;
}

export function friendlySupabaseError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.includes('SUPABASE_NOT_CONFIGURED')) return 'Connect a Supabase project in the environment file first.';
  if (/invalid login credentials/i.test(message)) return 'The email or password is incorrect.';
  if (/already registered|already exists/i.test(message)) return 'An account already exists for this email.';
  if (/email not confirmed/i.test(message)) return 'Confirm your email before signing in.';
  if (/network|fetch|offline/i.test(message)) return 'Core Alert cannot reach the server. Check your connection and try again.';
  if (/duplicate|unique/i.test(message)) return 'This record already exists.';
  if (/row-level security|permission|not allowed|forbidden/i.test(message)) return 'You do not have permission to perform this action.';
  return fallback;
}
