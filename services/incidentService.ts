import type { RealtimeChannel } from '@supabase/supabase-js';

import { friendlySupabaseError, requireSupabase } from '@/services/supabase';
import type { CloudIncident, IncidentGuardian, IncidentLocation } from '@/types/cloud';
import type { SOSActivationSource } from '@/types';

export type IncidentPoint = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt?: string;
};

export type CreateIncidentInput = {
  activationSource: SOSActivationSource;
  isDemo: boolean;
  location?: IncidentPoint | null;
  status?: 'active' | 'cancelled';
  cancelledDuringCountdown?: boolean;
};

export type LocationThrottleOptions = { minTimeMs?: number; minDistanceMeters?: number };

export function distanceMeters(a: IncidentPoint, b: IncidentPoint): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadius = 6_371_000;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const latitude1 = toRadians(a.latitude);
  const latitude2 = toRadians(b.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(haversine));
}

export function shouldPersistLocation(
  previous: IncidentPoint | null,
  next: IncidentPoint,
  previousAt: number | null,
  nextAt: number,
  options: LocationThrottleOptions = {},
): boolean {
  if (!previous || previousAt === null) return true;
  const minTimeMs = options.minTimeMs ?? 7_000;
  const minDistanceMeters = options.minDistanceMeters ?? 10;
  return nextAt - previousAt >= minTimeMs || distanceMeters(previous, next) >= minDistanceMeters;
}

async function currentUserId(): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Sign in before managing an SOS.');
  return data.user.id;
}

export async function createIncident(input: CreateIncidentInput): Promise<CloudIncident> {
  const client = requireSupabase();
  const userId = await currentUserId();
  const status = input.status ?? 'active';
  const { data, error } = await client.from('incidents').insert({
    user_id: userId,
    status,
    activation_source: input.activationSource,
    is_demo: input.isDemo,
    incident_latitude: input.location?.latitude ?? null,
    incident_longitude: input.location?.longitude ?? null,
    last_latitude: input.location?.latitude ?? null,
    last_longitude: input.location?.longitude ?? null,
    location_accuracy: input.location?.accuracy ?? null,
    cancelled_during_countdown: Boolean(input.cancelledDuringCountdown),
    ended_at: status === 'cancelled' ? new Date().toISOString() : null,
  }).select('*').single();
  if (error) throw new Error(friendlySupabaseError(error, 'The SOS incident could not be created.'));

  if (input.location) {
    const { error: locationError } = await client.from('incident_locations').insert({
      incident_id: data.id,
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      accuracy: input.location.accuracy,
      recorded_at: input.location.recordedAt ?? new Date().toISOString(),
    });
    if (locationError && __DEV__) console.warn('Initial incident location failed', locationError.message);
  }
  return data;
}

export async function updateIncidentLocation(incidentId: string, point: IncidentPoint): Promise<void> {
  const client = requireSupabase();
  const { error: updateError } = await client.from('incidents').update({
    last_latitude: point.latitude,
    last_longitude: point.longitude,
    location_accuracy: point.accuracy,
  }).eq('id', incidentId).eq('status', 'active');
  if (updateError) throw new Error(friendlySupabaseError(updateError, 'The latest location could not be shared.'));
  const { error: insertError } = await client.from('incident_locations').insert({
    incident_id: incidentId,
    latitude: point.latitude,
    longitude: point.longitude,
    accuracy: point.accuracy,
    recorded_at: point.recordedAt ?? new Date().toISOString(),
  });
  if (insertError) throw new Error(friendlySupabaseError(insertError, 'The location history could not be updated.'));
}

export async function assignGuardiansToIncident(incidentId: string): Promise<IncidentGuardian[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('assign_incident_guardians', { target_incident_id: incidentId });
  if (error) throw new Error(friendlySupabaseError(error, 'Guardians could not be assigned to this SOS.'));
  return data ?? [];
}

export async function resolveIncident(incidentId: string): Promise<CloudIncident> {
  const client = requireSupabase();
  const { data, error } = await client.from('incidents').update({ status: 'resolved', ended_at: new Date().toISOString() })
    .eq('id', incidentId).eq('status', 'active').select('*').single();
  if (error) throw new Error(friendlySupabaseError(error, 'The SOS could not be ended.'));
  return data;
}

export async function cancelIncident(incidentId: string): Promise<CloudIncident> {
  const client = requireSupabase();
  const { data, error } = await client.from('incidents').update({ status: 'cancelled', ended_at: new Date().toISOString() })
    .eq('id', incidentId).eq('status', 'active').select('*').single();
  if (error) throw new Error(friendlySupabaseError(error, 'The incident could not be cancelled.'));
  return data;
}

export async function getIncidentHistory(limit = 30, offset = 0): Promise<CloudIncident[]> {
  const client = requireSupabase();
  const userId = await currentUserId();
  const { data, error } = await client.from('incidents').select('*').eq('user_id', userId)
    .order('started_at', { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw new Error(friendlySupabaseError(error, 'Incident history could not be loaded.'));
  return data ?? [];
}

export async function getActiveIncident(): Promise<CloudIncident | null> {
  const client = requireSupabase();
  const userId = await currentUserId();
  const { data, error } = await client.from('incidents').select('*').eq('user_id', userId).eq('status', 'active')
    .order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(friendlySupabaseError(error, 'The active incident could not be restored.'));
  return data;
}

export async function getIncidentById(incidentId: string): Promise<CloudIncident | null> {
  const client = requireSupabase();
  const { data, error } = await client.from('incidents').select('*').eq('id', incidentId).maybeSingle();
  if (error) throw new Error(friendlySupabaseError(error, 'The incident could not be loaded.'));
  return data;
}

export async function getIncidentLocations(incidentId: string): Promise<IncidentLocation[]> {
  const client = requireSupabase();
  const { data, error } = await client.from('incident_locations').select('*').eq('incident_id', incidentId).order('recorded_at');
  if (error) throw new Error(friendlySupabaseError(error, 'Live location history could not be loaded.'));
  return data ?? [];
}

export async function getIncidentGuardians(incidentId: string): Promise<IncidentGuardian[]> {
  const client = requireSupabase();
  const { data, error } = await client.from('incident_guardians').select('*').eq('incident_id', incidentId).order('created_at');
  if (error) throw new Error(friendlySupabaseError(error, 'Guardian responses could not be loaded.'));
  return data ?? [];
}

export async function getAssignedActiveIncidents(): Promise<IncidentGuardian[]> {
  const client = requireSupabase();
  const userId = await currentUserId();
  const { data, error } = await client.from('incident_guardians').select('*').eq('guardian_user_id', userId).order('created_at', { ascending: false });
  if (error) throw new Error(friendlySupabaseError(error, 'Assigned incidents could not be loaded.'));
  return data ?? [];
}

export async function acknowledgeIncident(incidentId: string, response: 'seen' | 'responding' | 'cannot_respond'): Promise<IncidentGuardian> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('acknowledge_incident', { target_incident_id: incidentId, response });
  if (error) throw new Error(friendlySupabaseError(error, 'Your response could not be shared.'));
  const assignment = data?.[0];
  if (!assignment) throw new Error('This incident is not assigned to you.');
  return assignment;
}

export async function sendIncidentNotifications(incidentId: string): Promise<{ delivered: number; failed: number }> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('send-sos-notifications', { body: { incidentId } });
  if (error) throw new Error(friendlySupabaseError(error, 'Guardian notifications could not be delivered.'));
  return { delivered: Number(data?.delivered ?? 0), failed: Number(data?.failed ?? 0) };
}

function subscribe(
  name: string,
  table: 'incidents' | 'incident_locations' | 'incident_guardians',
  filter: string,
  callback: () => void,
  onStatus?: (status: 'connected' | 'reconnecting' | 'offline') => void,
): () => void {
  const client = requireSupabase();
  let channel: RealtimeChannel | null = client.channel(name)
    .on('postgres_changes', { event: '*', schema: 'public', table, filter }, callback)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onStatus?.('connected');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onStatus?.('reconnecting');
      else if (status === 'CLOSED') onStatus?.('offline');
    });
  return () => {
    if (channel) void client.removeChannel(channel);
    channel = null;
  };
}

export function subscribeToIncident(incidentId: string, callback: () => void, onStatus?: (status: 'connected' | 'reconnecting' | 'offline') => void): () => void {
  return subscribe(`incident:${incidentId}:${Date.now()}`, 'incidents', `id=eq.${incidentId}`, callback, onStatus);
}

export function subscribeToIncidentLocations(incidentId: string, callback: () => void, onStatus?: (status: 'connected' | 'reconnecting' | 'offline') => void): () => void {
  return subscribe(`locations:${incidentId}:${Date.now()}`, 'incident_locations', `incident_id=eq.${incidentId}`, callback, onStatus);
}

export function subscribeToIncidentGuardians(incidentId: string, callback: () => void, onStatus?: (status: 'connected' | 'reconnecting' | 'offline') => void): () => void {
  return subscribe(`guardians:${incidentId}:${Date.now()}`, 'incident_guardians', `incident_id=eq.${incidentId}`, callback, onStatus);
}

export function subscribeToNewGuardianIncidents(guardianUserId: string, callback: (incidentId: string) => void, onStatus?: (status: 'connected' | 'reconnecting' | 'offline') => void): () => void {
  const client = requireSupabase();
  let channel: RealtimeChannel | null = client.channel(`guardian-alerts:${guardianUserId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incident_guardians', filter: `guardian_user_id=eq.${guardianUserId}` }, (payload) => {
      const incidentId = (payload.new as { incident_id?: unknown }).incident_id;
      if (typeof incidentId === 'string') callback(incidentId);
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') onStatus?.('connected');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onStatus?.('reconnecting');
      else if (status === 'CLOSED') onStatus?.('offline');
    });
  return () => { if (channel) void client.removeChannel(channel); channel = null; };
}
