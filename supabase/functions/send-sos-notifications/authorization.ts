export function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function canSendIncidentNotification(
  callerId: string | null | undefined,
  incidentOwnerId: string | null | undefined,
): boolean {
  return Boolean(callerId && incidentOwnerId && callerId === incidentOwnerId);
}
