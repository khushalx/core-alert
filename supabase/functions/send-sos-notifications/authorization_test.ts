import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import { canSendIncidentNotification, isUuid } from './authorization.ts';

Deno.test('only the incident owner can send notifications', () => {
  assertEquals(canSendIncidentNotification('owner', 'owner'), true);
  assertEquals(canSendIncidentNotification('attacker', 'owner'), false);
  assertEquals(canSendIncidentNotification(null, 'owner'), false);
});

Deno.test('incident ids must be UUIDs', () => {
  assertEquals(isUuid('550e8400-e29b-41d4-a716-446655440000'), true);
  assertEquals(isUuid('../unrelated'), false);
});
