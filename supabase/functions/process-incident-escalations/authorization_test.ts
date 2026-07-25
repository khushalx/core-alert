import { assertEquals } from 'jsr:@std/assert';

import { escalationCutoff, isCronAuthorized } from './authorization.ts';

Deno.test('cron authorization requires the configured exact strong secret', () => {
  const secret = 'a-strong-random-secret-value';
  assertEquals(isCronAuthorized(secret, secret), true);
  assertEquals(isCronAuthorized('wrong', secret), false);
  assertEquals(isCronAuthorized(null, secret), false);
});

Deno.test('escalation cutoff never runs sooner than thirty seconds', () => {
  assertEquals(escalationCutoff(100_000, 5), new Date(70_000).toISOString());
});
