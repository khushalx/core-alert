import { createClient } from 'npm:@supabase/supabase-js@2';

import { buildSmsBody, normalizeE164 } from '../_shared/delivery.ts';
import { escalationCutoff, isCronAuthorized } from './authorization.ts';

type Incident = { id: string; user_id: string; is_demo: boolean };
type Recipient = {
  id: string;
  guardian_user_id: string | null;
  guardian_phone: string | null;
  is_primary: boolean;
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const expectedSecret = Deno.env.get('ESCALATION_CRON_SECRET');
  if (!isCronAuthorized(request.headers.get('x-core-alert-cron-secret'), expectedSecret)) {
    return json({ error: 'AUTH_REQUIRED' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceRoleKey) return json({ error: 'SERVER_NOT_CONFIGURED' }, 500);
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const afterSeconds = Number(Deno.env.get('ESCALATION_AFTER_SECONDS') ?? 90);
  const cutoff = escalationCutoff(Date.now(), afterSeconds);

  const { data, error } = await admin.from('incidents')
    .select('id,user_id,is_demo')
    .eq('status', 'active')
    .lte('started_at', cutoff)
    .order('started_at')
    .limit(20);
  if (error) return json({ error: 'INCIDENTS_UNAVAILABLE' }, 500);

  const results = [];
  for (const incident of (data ?? []) as Incident[]) {
    const existing = await admin.from('incident_escalation_events').select('id')
      .eq('incident_id', incident.id).eq('kind', 'guardian_timeout').maybeSingle();
    if (existing.data) continue;

    const [assignmentResult, recipientResult, profileResult] = await Promise.all([
      admin.from('incident_guardians').select('acknowledgement_status').eq('incident_id', incident.id),
      admin.from('incident_recipients').select('id,guardian_user_id,guardian_phone,is_primary')
        .eq('incident_id', incident.id).order('is_primary', { ascending: false }),
      admin.from('profiles').select('full_name').eq('id', incident.user_id).single(),
    ]);
    if (assignmentResult.error || recipientResult.error) continue;

    const responding = (assignmentResult.data ?? []).some((item) => item.acknowledgement_status === 'responding');
    const recipients = (recipientResult.data ?? []) as Recipient[];
    if (responding) {
      await admin.from('incident_recipients').update({ escalation_status: 'not_needed' }).eq('incident_id', incident.id);
      continue;
    }

    const linkedIds = recipients.flatMap((recipient) => recipient.guardian_user_id ? [recipient.guardian_user_id] : []);
    const tokensResult = linkedIds.length > 0
      ? await admin.from('device_push_tokens').select('id,user_id,expo_push_token').in('user_id', linkedIds).eq('is_active', true)
      : { data: [], error: null };
    const messages = (tokensResult.data ?? []).map((token) => ({
      to: token.expo_push_token,
      sound: 'default',
      channelId: 'guardian-sos-alerts-v3',
      priority: 'high',
      categoryId: 'CORE_ALERT_SOS',
      title: incident.is_demo ? 'Demo SOS still awaiting response' : 'Core Alert SOS escalation',
      body: incident.is_demo
        ? `${profileResult.data?.full_name ?? 'A Core Alert user'}'s demo SOS has no responding guardian. No emergency services were contacted.`
        : `${profileResult.data?.full_name ?? 'A Core Alert user'} still has no responding guardian. Tap to view live location.`,
      data: {
        url: `/guardian-incident/${incident.id}`,
        incidentId: incident.id,
        isDemo: incident.is_demo,
        escalation: true,
        notificationType: 'guardian_sos',
        recipientRole: 'guardian',
        protectedUserId: incident.user_id,
      },
    }));
    const tickets = await sendPush(messages);
    const tokens = tokensResult.data ?? [];
    const pushAccepted = tickets.filter((ticket) => ticket.status === 'ok').length;
    if (tokens.length > 0) {
      await admin.from('notification_deliveries').insert(tokens.map((token, index) => ({
        incident_id: incident.id,
        recipient_id: recipients.find((recipient) => recipient.guardian_user_id === token.user_id)?.id ?? null,
        guardian_user_id: token.user_id,
        push_token_id: token.id,
        provider: 'expo',
        provider_ticket_id: tickets[index]?.id ?? null,
        status: tickets[index]?.status === 'ok' ? 'accepted' : 'failed',
        provider_error: tickets[index]?.details?.error ?? tickets[index]?.message ?? (tickets[index] ? null : 'EXPO_PUSH_NO_TICKET'),
      })));
    }

    let smsSent = 0;
    for (const recipient of recipients) {
      const phone = normalizeE164(recipient.guardian_phone);
      let status: 'sent' | 'failed' = 'failed';
      if (phone && Deno.env.get('SMS_FALLBACK_ENABLED') === 'true') {
        const sms = await sendSms(phone, buildSmsBody({
          ownerName: profileResult.data?.full_name ?? 'A Core Alert user',
          incidentId: incident.id,
          isDemo: incident.is_demo,
          escalated: true,
        }));
        status = sms ? 'sent' : 'failed';
        if (sms) smsSent += 1;
        await admin.from('notification_deliveries').insert({
          incident_id: incident.id,
          recipient_id: recipient.id,
          guardian_user_id: recipient.guardian_user_id,
          provider: 'twilio',
          status: sms ? 'accepted' : 'failed',
          provider_error: sms ? null : 'SMS_PROVIDER_REJECTED',
        });
      }
      await admin.from('incident_recipients').update({ escalation_status: status }).eq('id', recipient.id);
    }

    const completed = pushAccepted + smsSent;
    await admin.from('incident_escalation_events').insert({
      incident_id: incident.id,
      level: 1,
      kind: 'guardian_timeout',
      status: completed > 0 ? (completed >= recipients.length ? 'completed' : 'partial') : 'failed',
      message: completed > 0
        ? `Guardian timeout escalation sent through ${pushAccepted} push and ${smsSent} SMS deliveries.`
        : 'Guardian timeout reached, but no configured delivery channel accepted the escalation.',
    });
    results.push({ incidentId: incident.id, pushAccepted, smsSent });
  }

  return json({ processed: results.length, incidents: results });
});

type PushTicket = { id?: string; status: string; message?: string; details?: { error?: string } };

async function sendPush(messages: unknown[]): Promise<PushTicket[]> {
  if (messages.length === 0) return [];
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!response.ok) return [];
    const payload = await response.json() as { data?: PushTicket[] };
    return payload.data ?? [];
  } catch {
    return [];
  }
}

async function sendSms(to: string, body: string): Promise<boolean> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM_NUMBER');
  if (!accountSid || !authToken || !from) return false;
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
