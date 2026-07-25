import { buildSmsBody, normalizeE164, shouldSendSmsFallback } from './delivery.ts';

type AdminClient = {
  from: (table: string) => any;
};

type Incident = { id: string; user_id: string; is_demo: boolean };
type Recipient = {
  id: string;
  guardian_user_id: string | null;
  guardian_phone: string | null;
  push_status?: string;
  sms_status?: string;
};
type Assignment = { id: string; guardian_user_id: string };
type PushToken = { id: string; user_id: string; expo_push_token: string };
type PushTicket = { id?: string; status: string; message?: string; details?: { error?: string } };

export async function deliverSosIncident(admin: AdminClient, incident: Incident) {
  const [profileResult, recipientResult, assignmentResult] = await Promise.all([
    admin.from('profiles').select('full_name').eq('id', incident.user_id).single(),
    admin.from('incident_recipients')
      .select('id,guardian_user_id,guardian_phone,push_status,sms_status')
      .eq('incident_id', incident.id),
    admin.from('incident_guardians').select('id,guardian_user_id').eq('incident_id', incident.id),
  ]);
  if (recipientResult.error || assignmentResult.error) throw new Error('RECIPIENTS_UNAVAILABLE');

  const recipients = (recipientResult.data ?? []) as Recipient[];
  const assignments = (assignmentResult.data ?? []) as Assignment[];
  if (recipients.length === 0) return { delivered: 0, failed: 0, smsSent: 0, guardians: [] };

  const claim = await admin.from('incident_escalation_events').insert({
    incident_id: incident.id,
    level: 0,
    kind: 'initial_delivery',
    status: 'pending',
    message: 'Initial guardian delivery is in progress.',
  }).select('id').maybeSingle();
  if (claim.error) {
    if (claim.error.code !== '23505') throw new Error('DELIVERY_CLAIM_FAILED');
    return summarizeExistingDelivery(recipients);
  }
  if (!claim.data?.id) throw new Error('DELIVERY_CLAIM_FAILED');

  const linkedIds = recipients.flatMap((recipient) => recipient.guardian_user_id ? [recipient.guardian_user_id] : []);
  const tokenResult = linkedIds.length > 0
    ? await admin.from('device_push_tokens').select('id,user_id,expo_push_token').in('user_id', linkedIds).eq('is_active', true)
    : { data: [], error: null };
  if (tokenResult.error) throw new Error('PUSH_TOKENS_UNAVAILABLE');

  const tokens = (tokenResult.data ?? []) as PushToken[];
  const ownerName = profileResult.data?.full_name ?? 'A Core Alert user';
  const messages = tokens.map((token) => ({
    to: token.expo_push_token,
    sound: 'default',
    channelId: 'guardian-sos-alerts-v3',
    priority: 'high',
    title: incident.is_demo ? 'Core Alert Demo SOS' : 'Core Alert SOS',
    body: incident.is_demo
      ? `Demo SOS from ${ownerName}. No real emergency services were contacted.`
      : `${ownerName} triggered an SOS. Tap to view their live location.`,
    categoryId: 'CORE_ALERT_SOS',
    data: {
      url: `/guardian-incident/${incident.id}`,
      incidentId: incident.id,
      isDemo: incident.is_demo,
      notificationType: 'guardian_sos',
      recipientRole: 'guardian',
      protectedUserId: incident.user_id,
    },
  }));
  const tickets = await sendExpoPush(messages);

  const deliveryRows = tokens.map((token, index) => {
    const recipient = recipients.find((item) => item.guardian_user_id === token.user_id);
    const ticket = tickets[index];
    return {
      incident_id: incident.id,
      recipient_id: recipient?.id ?? null,
      guardian_user_id: token.user_id,
      push_token_id: token.id,
      provider: 'expo',
      provider_ticket_id: ticket?.id ?? null,
      status: ticket?.status === 'ok' ? 'accepted' : 'failed',
      provider_error: ticket?.details?.error ?? ticket?.message ?? (ticket ? null : 'EXPO_PUSH_NO_TICKET'),
    };
  });
  if (deliveryRows.length > 0) await admin.from('notification_deliveries').insert(deliveryRows);

  const invalidTokens = tokens
    .filter((_token, index) => tickets[index]?.details?.error === 'DeviceNotRegistered')
    .map((token) => token.expo_push_token);
  if (invalidTokens.length > 0) {
    await admin.from('device_push_tokens').update({ is_active: false }).in('expo_push_token', invalidTokens);
  }

  const smsEnabled = Deno.env.get('SMS_FALLBACK_ENABLED') === 'true';
  const results = [];
  for (const recipient of recipients) {
    const recipientTokenIndexes = tokens
      .map((token, index) => token.user_id === recipient.guardian_user_id ? index : -1)
      .filter((index) => index >= 0);
    // "ok" means Expo accepted the message, not that a human saw it.
    const pushAccepted = recipientTokenIndexes.some((index) => tickets[index]?.status === 'ok');
    let smsStatus: 'not_configured' | 'sent' | 'failed' | 'skipped' =
      normalizeE164(recipient.guardian_phone) ? 'skipped' : 'not_configured';
    let lastError: string | null = pushAccepted ? null : 'PUSH_UNAVAILABLE';

    if (shouldSendSmsFallback({
      smsEnabled,
      phone: recipient.guardian_phone,
      hasLinkedAccount: Boolean(recipient.guardian_user_id),
      pushDelivered: pushAccepted,
    })) {
      const sms = await sendTwilioSms(normalizeE164(recipient.guardian_phone)!, buildSmsBody({
        ownerName,
        incidentId: incident.id,
        isDemo: incident.is_demo,
      }));
      smsStatus = sms.sent ? 'sent' : 'failed';
      lastError = sms.sent ? null : sms.error;
      await admin.from('notification_deliveries').insert({
        incident_id: incident.id,
        recipient_id: recipient.id,
        guardian_user_id: recipient.guardian_user_id,
        provider: 'twilio',
        status: sms.sent ? 'accepted' : 'failed',
        provider_error: sms.error,
      });
    } else if (normalizeE164(recipient.guardian_phone) && !smsEnabled && !pushAccepted) {
      smsStatus = 'not_configured';
      lastError = 'SMS_PROVIDER_NOT_CONFIGURED';
    }

    const delivered = pushAccepted || smsStatus === 'sent';
    await admin.from('incident_recipients').update({
      push_status: recipient.guardian_user_id ? (pushAccepted ? 'delivered' : 'failed') : 'not_applicable',
      sms_status: smsStatus,
      last_error: lastError,
    }).eq('id', recipient.id);

    if (recipient.guardian_user_id) {
      const assignment = assignments.find((item) => item.guardian_user_id === recipient.guardian_user_id);
      if (assignment) {
        await admin.from('incident_guardians')
          .update({ delivery_status: delivered ? 'delivered' : 'failed' })
          .eq('id', assignment.id);
      }
    }
    results.push({
      recipientId: recipient.id,
      push: recipient.guardian_user_id ? (pushAccepted ? 'accepted' : 'failed') : 'not_applicable',
      sms: smsStatus,
      delivered,
    });
  }

  const delivered = results.filter((result) => result.delivered).length;
  const failed = results.length - delivered;
  await admin.from('incident_escalation_events').update({
    status: failed === 0 ? 'completed' : delivered > 0 ? 'partial' : 'failed',
    message: `${delivered} of ${results.length} guardian recipients had an initial push accepted or SMS sent.`,
  }).eq('id', claim.data.id);
  return {
    delivered,
    failed,
    smsSent: results.filter((result) => result.sms === 'sent').length,
    guardians: results,
  };
}

function summarizeExistingDelivery(recipients: Array<Recipient & {
  push_status?: string;
  sms_status?: string;
}>) {
  const results = recipients.map((recipient) => {
    const pushAccepted = recipient.push_status === 'delivered';
    const smsSent = recipient.sms_status === 'sent';
    return {
      recipientId: recipient.id,
      push: recipient.guardian_user_id ? (pushAccepted ? 'accepted' : 'failed') : 'not_applicable',
      sms: smsSent ? 'sent' : recipient.sms_status ?? 'skipped',
      delivered: pushAccepted || smsSent,
    };
  });
  return {
    delivered: results.filter((result) => result.delivered).length,
    failed: results.filter((result) => !result.delivered).length,
    smsSent: results.filter((result) => result.sms === 'sent').length,
    guardians: results,
    idempotent: true,
  };
}

async function sendExpoPush(messages: unknown[]): Promise<PushTicket[]> {
  if (messages.length === 0) return [];
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  if (!response.ok) return [];
  const payload = await response.json() as { data?: PushTicket[] };
  return payload.data ?? [];
}

async function sendTwilioSms(to: string, body: string): Promise<{ sent: boolean; error: string | null }> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_FROM_NUMBER');
  if (!accountSid || !authToken || !from) return { sent: false, error: 'SMS_PROVIDER_NOT_CONFIGURED' };
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    return response.ok ? { sent: true, error: null } : { sent: false, error: `SMS_PROVIDER_${response.status}` };
  } catch {
    return { sent: false, error: 'SMS_PROVIDER_NETWORK_ERROR' };
  }
}
