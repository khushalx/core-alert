import { createClient } from 'npm:@supabase/supabase-js@2';

import { deliverSosIncident } from '../_shared/sosDelivery.ts';
import { canSendIncidentNotification, isUuid } from './authorization.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RequestBody = { incidentId?: unknown };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'AUTH_REQUIRED' }, 401);
    const body = await request.json() as RequestBody;
    if (!isUuid(body.incidentId)) return json({ error: 'INVALID_INCIDENT_ID' }, 400);

    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !anonKey || !serviceRoleKey) return json({ error: 'SERVER_NOT_CONFIGURED' }, 500);

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await caller.auth.getUser();
    if (userError || !userData.user) return json({ error: 'INVALID_SESSION' }, 401);

    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const { data: incident, error } = await admin.from('incidents')
      .select('id,user_id,is_demo,status')
      .eq('id', body.incidentId)
      .maybeSingle();
    if (error || !incident) return json({ error: 'INCIDENT_NOT_FOUND' }, 404);
    if (!canSendIncidentNotification(userData.user.id, incident.user_id)) {
      return json({ error: 'NOT_INCIDENT_OWNER' }, 403);
    }
    if (incident.status !== 'active') return json({ error: 'INCIDENT_NOT_ACTIVE' }, 409);
    return json(await deliverSosIncident(admin, incident));
  } catch (error) {
    console.error('send-sos-notifications failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: error instanceof Error ? error.message : 'INTERNAL_ERROR' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
