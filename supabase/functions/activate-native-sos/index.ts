import { createClient } from 'npm:@supabase/supabase-js@2';

import { deliverSosIncident } from '../_shared/sosDelivery.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type, x-core-alert-device-id, x-core-alert-device-secret',
};

type LocationInput = { latitude?: unknown; longitude?: unknown; accuracy?: unknown };
type Body = {
  action?: unknown;
  activationId?: unknown;
  incidentId?: unknown;
  isDemo?: unknown;
  location?: LocationInput;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const deviceId = request.headers.get('x-core-alert-device-id');
    const deviceSecret = request.headers.get('x-core-alert-device-secret');
    if (!isUuid(deviceId) || !deviceSecret || deviceSecret.length < 32) {
      return json({ error: 'DEVICE_AUTH_REQUIRED' }, 401);
    }
    const url = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceRoleKey) return json({ error: 'SERVER_NOT_CONFIGURED' }, 500);
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const { data: device, error: deviceError } = await admin.from('protection_devices')
      .select('id,user_id,secret_hash,enabled')
      .eq('id', deviceId)
      .maybeSingle();
    const suppliedHash = await sha256(deviceSecret);
    if (deviceError || !device || !device.enabled || !constantTimeEqual(suppliedHash, device.secret_hash)) {
      return json({ error: 'INVALID_DEVICE_CREDENTIAL' }, 401);
    }
    await admin.from('protection_devices').update({ last_used_at: new Date().toISOString() }).eq('id', device.id);

    const body = await request.json() as Body;
    if (body.action === 'location') {
      if (!isUuid(body.incidentId) || !validLocation(body.location)) return json({ error: 'INVALID_LOCATION_UPDATE' }, 400);
      const { data: incident } = await admin.from('incidents')
        .select('id')
        .eq('id', body.incidentId)
        .eq('user_id', device.user_id)
        .eq('status', 'active')
        .maybeSingle();
      if (!incident) return json({ error: 'INCIDENT_NOT_ACTIVE' }, 409);
      const location = normalizeLocation(body.location);
      const timestamp = new Date().toISOString();
      const [updateResult, insertResult] = await Promise.all([
        admin.from('incidents').update({
          last_latitude: location.latitude,
          last_longitude: location.longitude,
          location_accuracy: location.accuracy,
        }).eq('id', incident.id),
        admin.from('incident_locations').insert({
          incident_id: incident.id,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          recorded_at: timestamp,
        }),
      ]);
      if (updateResult.error || insertResult.error) return json({ error: 'LOCATION_SAVE_FAILED' }, 500);
      return json({ incidentId: incident.id, updated: true });
    }

    if (body.action !== 'activate' || !isUuid(body.activationId)) {
      return json({ error: 'INVALID_ACTIVATION' }, 400);
    }
    const location = validLocation(body.location) ? normalizeLocation(body.location) : null;
    const { data: existing } = await admin.from('incidents')
      .select('id,user_id,is_demo,status')
      .eq('user_id', device.user_id)
      .eq('native_activation_id', body.activationId)
      .maybeSingle();
    if (existing?.status === 'active') return json({ incidentId: existing.id, idempotent: true });
    if (existing) return json({ error: 'ACTIVATION_ALREADY_RESOLVED' }, 409);

    const { data: activeIncident } = await admin.from('incidents')
      .select('id,user_id,is_demo,status')
      .eq('user_id', device.user_id)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeIncident) {
      return json({ incidentId: activeIncident.id, idempotent: true, restoredActive: true });
    }

    const { data: incident, error: incidentError } = await admin.from('incidents').insert({
      user_id: device.user_id,
      status: 'active',
      activation_source: 'volume-shortcut',
      is_demo: body.isDemo === true,
      native_activation_id: body.activationId,
      incident_latitude: location?.latitude ?? null,
      incident_longitude: location?.longitude ?? null,
      last_latitude: location?.latitude ?? null,
      last_longitude: location?.longitude ?? null,
      location_accuracy: location?.accuracy ?? null,
    }).select('id,user_id,is_demo,status').single();
    if (incidentError || !incident) {
      if (incidentError?.code === '23505') {
        const { data: concurrentIncident } = await admin.from('incidents')
          .select('id')
          .eq('user_id', device.user_id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        if (concurrentIncident) {
          return json({ incidentId: concurrentIncident.id, idempotent: true, restoredActive: true });
        }
      }
      return json({ error: 'INCIDENT_CREATE_FAILED' }, 500);
    }

    if (location) {
      await admin.from('incident_locations').insert({
        incident_id: incident.id,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
      });
    }
    const { data: relationships, error: relationshipsError } = await admin.from('guardian_relationships')
      .select('id,guardian_user_id,guardian_name,guardian_phone,is_primary,status')
      .eq('protected_user_id', device.user_id)
      .in('status', ['pending', 'accepted']);
    if (relationshipsError) return json({ error: 'GUARDIANS_UNAVAILABLE', incidentId: incident.id }, 500);

    const linked = (relationships ?? []).filter((relationship) =>
      relationship.guardian_user_id && relationship.status === 'accepted'
    );
    if (linked.length > 0) {
      await admin.from('incident_guardians').upsert(
        linked.map((relationship) => ({
          incident_id: incident.id,
          guardian_user_id: relationship.guardian_user_id,
        })),
        { onConflict: 'incident_id,guardian_user_id' },
      );
    }
    const recipients = (relationships ?? []).filter((relationship) =>
      relationship.guardian_user_id || String(relationship.guardian_phone ?? '').trim()
    );
    if (recipients.length > 0) {
      await admin.from('incident_recipients').upsert(
        recipients.map((relationship) => ({
          incident_id: incident.id,
          relationship_id: relationship.id,
          guardian_user_id: relationship.guardian_user_id,
          guardian_name: relationship.guardian_name,
          guardian_phone: relationship.guardian_phone,
          is_primary: relationship.is_primary,
          push_status: relationship.guardian_user_id ? 'pending' : 'not_applicable',
          sms_status: String(relationship.guardian_phone ?? '').trim() ? 'pending' : 'not_configured',
        })),
        { onConflict: 'incident_id,relationship_id' },
      );
    }

    let delivery;
    try {
      delivery = await deliverSosIncident(admin, incident);
    } catch (error) {
      console.error('native guardian delivery failed', error instanceof Error ? error.message : 'unknown');
      delivery = { delivered: 0, failed: recipients.length, smsSent: 0 };
    }
    return json({ incidentId: incident.id, delivery });
  } catch (error) {
    console.error('activate-native-sos failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});

function validLocation(value: LocationInput | undefined): boolean {
  return typeof value?.latitude === 'number' && Number.isFinite(value.latitude)
    && value.latitude >= -90 && value.latitude <= 90
    && typeof value.longitude === 'number' && Number.isFinite(value.longitude)
    && value.longitude >= -180 && value.longitude <= 180;
}

function normalizeLocation(value: LocationInput) {
  return {
    latitude: value.latitude as number,
    longitude: value.longitude as number,
    accuracy: typeof value.accuracy === 'number' && Number.isFinite(value.accuracy) ? value.accuracy : null,
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
