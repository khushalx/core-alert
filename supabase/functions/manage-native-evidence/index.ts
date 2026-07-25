import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'incident-evidence';
const MAX_BYTES = 150 * 1024 * 1024;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, content-type, x-core-alert-device-id, x-core-alert-device-secret',
};

type Body = {
  action?: unknown;
  incidentId?: unknown;
  evidenceId?: unknown;
  mimeType?: unknown;
  mode?: unknown;
  byteSize?: unknown;
  durationMs?: unknown;
  capturedAt?: unknown;
  sha256?: unknown;
  storagePath?: unknown;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceRoleKey) return json({ error: 'SERVER_NOT_CONFIGURED' }, 500);
    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const device = await authenticateDevice(request, admin);
    if (!device) return json({ error: 'INVALID_DEVICE_CREDENTIAL' }, 401);

    const body = await request.json() as Body;
    if (!isUuid(body.incidentId) || !isUuid(body.evidenceId)) {
      return json({ error: 'INVALID_EVIDENCE_REFERENCE' }, 400);
    }
    const { data: incident, error: incidentError } = await admin
      .from('incidents')
      .select('id,user_id,status,is_demo,started_at,ended_at')
      .eq('id', body.incidentId)
      .eq('user_id', device.user_id)
      .maybeSingle();
    if (incidentError || !incident) return json({ error: 'INCIDENT_NOT_FOUND' }, 404);

    const extension = body.mimeType === 'video/mp4' ? 'mp4'
      : body.mimeType === 'audio/mp4' ? 'm4a'
      : null;
    const mediaType = body.mode === 'video' ? 'video'
      : body.mode === 'audio' ? 'audio'
      : null;
    const storagePath = `${device.user_id}/${incident.id}/${body.evidenceId}.${extension ?? 'invalid'}`;

    if (body.action === 'prepare') {
      if (!extension || !mediaType || !validSize(body.byteSize) || !validDuration(body.durationMs)
        || !validSha256(body.sha256) || typeof body.capturedAt !== 'number') {
        return json({ error: 'INVALID_EVIDENCE_METADATA' }, 400);
      }
      const { data: existing } = await admin.from('incident_evidence')
        .select('id,incident_id,user_id')
        .eq('id', body.evidenceId)
        .maybeSingle();
      if (existing && (existing.user_id !== device.user_id || existing.incident_id !== incident.id)) {
        return json({ error: 'EVIDENCE_ID_CONFLICT' }, 409);
      }
      if (!existing && !captureBelongsToIncident(
        incident.started_at,
        incident.ended_at,
        incident.status,
        body.capturedAt,
      )) {
        return json({ error: 'EVIDENCE_OUTSIDE_INCIDENT_WINDOW' }, 409);
      }
      const capturedAt = new Date(body.capturedAt).toISOString();
      const { error: upsertError } = await admin.from('incident_evidence').upsert({
        id: body.evidenceId,
        incident_id: incident.id,
        user_id: device.user_id,
        storage_path: storagePath,
        media_type: mediaType,
        mime_type: body.mimeType,
        status: 'pending',
        byte_size: body.byteSize,
        duration_ms: body.durationMs,
        sha256: body.sha256,
        captured_at: capturedAt,
      }, { onConflict: 'id' });
      if (upsertError) {
        console.error('evidence metadata upsert failed', upsertError.message);
        return json({ error: 'EVIDENCE_PREPARE_FAILED' }, 500);
      }
      const { data: signed, error: signedError } = await admin.storage
        .from(BUCKET)
        .createSignedUploadUrl(storagePath, { upsert: true });
      if (signedError || !signed?.signedUrl) {
        console.error('signed evidence upload failed', signedError?.message ?? 'missing URL');
        return json({ error: 'SIGNED_UPLOAD_FAILED' }, 500);
      }
      return json({ evidenceId: body.evidenceId, storagePath, signedUrl: signed.signedUrl });
    }

    if (body.action === 'complete') {
      if (body.storagePath !== storagePath || !validSize(body.byteSize)
        || !validDuration(body.durationMs) || !validSha256(body.sha256)) {
        return json({ error: 'INVALID_COMPLETION_METADATA' }, 400);
      }
      const { data: existing, error: existingError } = await admin.from('incident_evidence')
        .select('id')
        .eq('id', body.evidenceId)
        .eq('incident_id', incident.id)
        .eq('user_id', device.user_id)
        .eq('storage_path', storagePath)
        .maybeSingle();
      if (existingError || !existing) return json({ error: 'EVIDENCE_NOT_PREPARED' }, 409);
      const separator = storagePath.lastIndexOf('/');
      const folder = storagePath.slice(0, separator);
      const filename = storagePath.slice(separator + 1);
      const { data: uploadedObjects, error: objectError } = await admin.storage
        .from(BUCKET)
        .list(folder, { search: filename, limit: 10 });
      const uploadedObject = uploadedObjects?.find((object) => object.name === filename);
      if (objectError || !uploadedObject) return json({ error: 'EVIDENCE_OBJECT_MISSING' }, 409);
      const uploadedSize = Number(uploadedObject.metadata?.size ?? 0);
      if (uploadedSize > 0 && uploadedSize !== body.byteSize) {
        return json({ error: 'EVIDENCE_SIZE_MISMATCH' }, 409);
      }
      const { error: updateError } = await admin.from('incident_evidence').update({
        status: 'uploaded',
        byte_size: body.byteSize,
        duration_ms: body.durationMs,
        sha256: body.sha256,
        uploaded_at: new Date().toISOString(),
      }).eq('id', body.evidenceId);
      if (updateError) return json({ error: 'EVIDENCE_FINALIZE_FAILED' }, 500);
      return json({ evidenceId: body.evidenceId, storagePath, uploaded: true });
    }

    return json({ error: 'INVALID_ACTION' }, 400);
  } catch (error) {
    console.error('manage-native-evidence failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});

async function authenticateDevice(
  request: Request,
  admin: ReturnType<typeof createClient>,
): Promise<{ id: string; user_id: string } | null> {
  const deviceId = request.headers.get('x-core-alert-device-id');
  const deviceSecret = request.headers.get('x-core-alert-device-secret');
  if (!isUuid(deviceId) || !deviceSecret || deviceSecret.length < 32) return null;
  const { data: device, error } = await admin.from('protection_devices')
    .select('id,user_id,secret_hash,enabled')
    .eq('id', deviceId)
    .maybeSingle();
  if (error || !device || !device.enabled) return null;
  const suppliedHash = await sha256(deviceSecret);
  if (!constantTimeEqual(suppliedHash, device.secret_hash)) return null;
  await admin.from('protection_devices')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', device.id);
  return { id: device.id, user_id: device.user_id };
}

function validSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_BYTES;
}

function validDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3_600_000;
}

function captureBelongsToIncident(
  startedAt: string,
  endedAt: string | null,
  status: string,
  capturedAt: number,
): boolean {
  const captured = capturedAt;
  const started = Date.parse(startedAt);
  const ended = endedAt ? Date.parse(endedAt) : null;
  if (!Number.isFinite(started) || captured < started - 60_000) return false;
  if (ended !== null && Number.isFinite(ended)) return captured <= ended + 60_000;
  return status === 'active' && captured <= Date.now() + 60_000;
}

function validSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
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
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
