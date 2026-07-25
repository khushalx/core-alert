import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { friendlySupabaseError, requireSupabase } from '@/services/supabase';

export const DEFAULT_EMERGENCY_NUMBER = '112';

export function sanitizeDialNumber(value: string): string {
  return value.replace(/[^0-9+*#]/g, '');
}

export async function openEmergencyDialer(incidentId?: string | null, number = DEFAULT_EMERGENCY_NUMBER): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Emergency calling handoff is available on a phone.');
  const dialNumber = sanitizeDialNumber(number);
  if (!dialNumber) throw new Error('The emergency number is invalid.');
  const url = `tel:${dialNumber}`;
  const supported = await Linking.canOpenURL(url).catch(() => false);
  if (!supported) throw new Error('No phone dialer is available on this device.');
  await Linking.openURL(url);

  // Opening the dialer does not prove that a call was placed or answered. The
  // event records only the handoff so the incident timeline remains honest.
  if (incidentId) {
    const client = requireSupabase();
    const { error } = await client.rpc('record_emergency_call_handoff', { target_incident_id: incidentId });
    if (error && __DEV__) console.warn(friendlySupabaseError(error, 'Emergency call handoff could not be recorded.'));
  }
}
