import { createClient } from 'npm:@supabase/supabase-js@2';

import { canSendIncidentNotification, isUuid } from './authorization.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RequestBody = { incidentId?: unknown };
type GuardianAssignment = {
  id: string;
  guardian_user_id: string;
};
type PushToken = {
  user_id: string;
  expo_push_token: string;
};

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

    const callerClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'INVALID_SESSION' }, 401);

    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const { data: incident, error: incidentError } = await admin
      .from('incidents')
      .select('id,user_id,is_demo,status')
      .eq('id', body.incidentId)
      .maybeSingle();
    if (incidentError || !incident) return json({ error: 'INCIDENT_NOT_FOUND' }, 404);
    if (!canSendIncidentNotification(userData.user.id, incident.user_id)) {
      return json({ error: 'NOT_INCIDENT_OWNER' }, 403);
    }
    if (incident.status !== 'active') return json({ error: 'INCIDENT_NOT_ACTIVE' }, 409);

    const [{ data: ownerProfile }, { data: assignments, error: assignmentError }] = await Promise.all([
      admin.from('profiles').select('full_name').eq('id', incident.user_id).single(),
      admin.from('incident_guardians').select('id,guardian_user_id').eq('incident_id', incident.id),
    ]);
    if (assignmentError) return json({ error: 'ASSIGNMENTS_UNAVAILABLE' }, 500);

    const typedAssignments = (assignments ?? []) as GuardianAssignment[];
    if (typedAssignments.length === 0) return json({ delivered: 0, failed: 0, guardians: [] });

    const guardianIds = typedAssignments.map((item) => item.guardian_user_id);
    const { data: tokens, error: tokenError } = await admin
      .from('device_push_tokens')
      .select('user_id,expo_push_token')
      .in('user_id', guardianIds)
      .eq('is_active', true);
    if (tokenError) return json({ error: 'PUSH_TOKENS_UNAVAILABLE' }, 500);

    const tokenRows = (tokens ?? []) as PushToken[];
    const name = ownerProfile?.full_name ?? 'A Core Alert user';
    const messages = tokenRows.map((token) => ({
      to: token.expo_push_token,
      sound: 'default',
      channelId: 'sos-alerts',
      priority: 'high',
      title: 'Core Alert SOS',
      body: incident.is_demo
        ? `Demo SOS from ${name}. No real emergency services were contacted.`
        : `${name} triggered an SOS. Tap to view their live location.`,
      data: {
        url: `/guardian-incident/${incident.id}`,
        incidentId: incident.id,
        isDemo: incident.is_demo,
      },
    }));

    const expoResponse = messages.length > 0
      ? await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
          body: JSON.stringify(messages),
        })
      : null;
    const expoPayload = expoResponse ? await expoResponse.json() as { data?: { status: string; details?: { error?: string } }[] } : { data: [] };
    const tickets = expoPayload.data ?? [];
    const invalidTokens = tokenRows
      .filter((_token, index) => tickets[index]?.details?.error === 'DeviceNotRegistered')
      .map((token) => token.expo_push_token);
    if (invalidTokens.length > 0) {
      await admin.from('device_push_tokens').update({ is_active: false }).in('expo_push_token', invalidTokens);
    }

    const results = typedAssignments.map((assignment) => {
      const indexes = tokenRows
        .map((token, index) => token.user_id === assignment.guardian_user_id ? index : -1)
        .filter((index) => index >= 0);
      const delivered = indexes.some((index) => tickets[index]?.status === 'ok');
      return { assignmentId: assignment.id, guardianUserId: assignment.guardian_user_id, status: delivered ? 'delivered' : 'failed' };
    });

    await Promise.all(results.map((result) => admin
      .from('incident_guardians')
      .update({ delivery_status: result.status })
      .eq('id', result.assignmentId)));

    return json({
      delivered: results.filter((result) => result.status === 'delivered').length,
      failed: results.filter((result) => result.status === 'failed').length,
      guardians: results,
    });
  } catch (error) {
    console.error('send-sos-notifications failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'INTERNAL_ERROR' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
