export function normalizeE164(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/[\s()-]/g, '') ?? '';
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function shouldSendSmsFallback(input: {
  smsEnabled: boolean;
  phone: string | null | undefined;
  hasLinkedAccount: boolean;
  pushDelivered: boolean;
}): boolean {
  return input.smsEnabled
    && Boolean(normalizeE164(input.phone))
    && (!input.hasLinkedAccount || !input.pushDelivered);
}

export function buildSmsBody(input: {
  ownerName: string;
  incidentId: string;
  isDemo: boolean;
  escalated?: boolean;
}): string {
  if (input.isDemo) {
    return `DEMO Core Alert SOS from ${input.ownerName}. No police or emergency service was contacted. Open Core Alert to view the demo incident.`;
  }
  const prefix = input.escalated ? 'ESCALATION: no guardian has responded yet.' : 'Core Alert SOS.';
  return `${prefix} ${input.ownerName} triggered an SOS. Open Core Alert to view live location. Emergency services are not contacted automatically.`;
}
