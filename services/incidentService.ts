import type { RealtimeChannel } from '@supabase/supabase-js';

import { friendlySupabaseError, requireSupabase } from '@/services/supabase';
import type {
  CloudIncident,
  IncidentEscalationEvent,
  IncidentEvidence,
  IncidentGuardian,
  IncidentLocation,
  IncidentRecipient,
} from '@/types/cloud';
import type { SOSActivationSource } from '@/types';

export type IncidentPoint = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt?: string;
};

export type CreateIncidentInput = {
  activationId: string;
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
  if (status === 'active') {
    const { data, error } = await client.rpc('create_or_restore_incident', {
      activation_id: input.activationId,
      requested_activation_source: input.activationSource,
      requested_is_demo: input.isDemo,
      requested_latitude: input.location?.latitude ?? null,
      requested_longitude: input.location?.longitude ?? null,
      requested_accuracy: input.location?.accuracy ?? null,
    });
    if (error || !data) {
      throw new Error(friendlySupabaseError(error, 'The SOS incident could not be created.'));
    }
    return data;
  }
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
    native_activation_id: input.activationId,
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
  const { error } = await client.rpc('append_active_incident_location', {
    target_incident_id: incidentId,
    requested_latitude: point.latitude,
    requested_longitude: point.longitude,
    requested_accuracy: point.accuracy,
    requested_recorded_at: point.recordedAt ?? new Date().toISOString(),
  });
  if (error) throw new Error(friendlySupabaseError(error, 'The latest location could not be shared.'));
}

export async function assignGuardiansToIncident(incidentId: string): Promise<IncidentGuardian[]> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('assign_incident_guardians', { target_incident_id: incidentId });
  if (error) throw new Error(friendlySupabaseError(error, 'Guardians could not be assigned to this SOS.'));
  return data ?? [];
}

export async function resolveIncident(incidentId: string): Promise<CloudIncident> {
  const client = requireSupabase();
  const { data: rpcData, error: rpcError } = await client.rpc('resolve_incident_idempotent', {
    target_incident_id: incidentId,
  });
  if (!rpcError && rpcData) return rpcData;

  // Older backend deployments may not have the reliability RPC yet. The
  // owner-only incidents RLS policy still makes this direct update safe, and
  // the status predicate keeps it idempotent.
  const endedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await client
    .from('incidents')
    .update({ status: 'resolved', ended_at: endedAt })
    .eq('id', incidentId)
    .eq('status', 'active')
    .select('*')
    .maybeSingle();
  if (updateError) {
    throw new Error(friendlySupabaseError(updateError, 'The SOS could not be ended.'));
  }
  if (updated) return updated;

  // A retry can arrive after the first request resolved the row but before the
  // response reached the device. Treat an already-resolved owned row as
  // success instead of trapping the UI in ENDING_FAILED.
  const { data: existing, error: readError } = await client
    .from('incidents')
    .select('*')
    .eq('id', incidentId)
    .maybeSingle();
  if (readError) {
    throw new Error(friendlySupabaseError(readError, 'The SOS could not be ended.'));
  }
  if (existing?.status === 'resolved') return existing;
  throw new Error(friendlySupabaseError(rpcError, 'The SOS could not be ended.'));
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

export async function acknowledgeIncidentFromNotification(
  incidentId: string,
  response: 'seen' | 'responding' | 'cannot_respond' | 'open_location',
): Promise<IncidentGuardian | null> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('acknowledge_incident_from_notification', {
    target_incident_id: incidentId,
    response,
  });
  if (error) throw new Error(friendlySupabaseError(error, 'Your notification response could not be shared.'));
  return data?.[0] ?? null;
}

export async function sendIncidentNotifications(incidentId: string): Promise<{ delivered: number; failed: number; smsSent: number }> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('send-sos-notifications', { body: { incidentId } });
  if (error) throw new Error(friendlySupabaseError(error, 'Guardian notifications could not be delivered.'));
  return { delivered: Number(data?.delivered ?? 0), failed: Number(data?.failed ?? 0), smsSent: Number(data?.smsSent ?? 0) };
}

export async function getIncidentRecipients(incidentId: string): Promise<IncidentRecipient[]> {
  const client = requireSupabase();
  const { data, error } = await client.from('incident_recipients').select('*').eq('incident_id', incidentId)
    .order('is_primary', { ascending: false }).order('created_at');
  if (error) throw new Error(friendlySupabaseError(error, 'Guardian delivery details could not be loaded.'));
  return data ?? [];
}

export async function getIncidentEscalationEvents(incidentId: string): Promise<IncidentEscalationEvent[]> {
  const client = requireSupabase();
  const { data, error } = await client.from('incident_escalation_events').select('*').eq('incident_id', incidentId).order('created_at');
  if (error) throw new Error(friendlySupabaseError(error, 'Incident escalation details could not be loaded.'));
  return data ?? [];
}

export async function getIncidentEvidence(incidentId: string): Promise<IncidentEvidence[]> {
  const client = requireSupabase();
  const { data, error } = await client.from('incident_evidence')
    .select('*')
    .eq('incident_id', incidentId)
    .eq('status', 'uploaded')
    .order('captured_at', { ascending: false });
  if (error) throw new Error(friendlySupabaseError(error, 'Emergency evidence could not be loaded.'));
  return data ?? [];
}

export async function createIncidentEvidenceUrl(evidence: IncidentEvidence): Promise<string> {
  const client = requireSupabase();
  const { data, error } = await client.storage
    .from('incident-evidence')
    .createSignedUrl(evidence.storage_path, 5 * 60);
  if (error || !data?.signedUrl) {
    throw new Error(friendlySupabaseError(error, 'A secure evidence link could not be created.'));
  }
  return data.signedUrl;
}

export async function recordResponderSimulation(
  incidentId: string,
  status: 'received' | 'reviewing' | 'dispatched_simulation' | 'closed',
): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc('record_responder_simulation', { target_incident_id: incidentId, simulated_status: status });
  if (error) throw new Error(friendlySupabaseError(error, 'The simulated responder status could not be saved.'));
}

function subscribe(
  name: string,
  table: 'incidents' | 'incident_locations' | 'incident_guardians' | 'incident_recipients' | 'incident_escalation_events' | 'notification_deliveries' | 'incident_evidence',
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

export function subscribeToIncidentDelivery(incidentId: string, callback: () => void, onStatus?: (status: 'connected' | 'reconnecting' | 'offline') => void): () => void {
  const stopRecipients = subscribe(`recipients:${incidentId}:${Date.now()}`, 'incident_recipients', `incident_id=eq.${incidentId}`, callback, onStatus);
  const stopEscalations = subscribe(`escalations:${incidentId}:${Date.now()}`, 'incident_escalation_events', `incident_id=eq.${incidentId}`, callback, onStatus);
  const stopNotifications = subscribe(`notification-deliveries:${incidentId}:${Date.now()}`, 'notification_deliveries', `incident_id=eq.${incidentId}`, callback, onStatus);
  return () => { stopRecipients(); stopEscalations(); stopNotifications(); };
}

export function subscribeToIncidentEvidence(
  incidentId: string,
  callback: () => void,
  onStatus?: (status: 'connected' | 'reconnecting' | 'offline') => void,
): () => void {
  return subscribe(
    `evidence:${incidentId}:${Date.now()}`,
    'incident_evidence',
    `incident_id=eq.${incidentId}`,
    callback,
    onStatus,
  );
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
