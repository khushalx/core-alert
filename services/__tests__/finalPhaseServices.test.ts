import fs from 'node:fs';
import path from 'node:path';

jest.mock('@/services/supabase', () => ({
  friendlySupabaseError: (_error: unknown, fallback: string) => fallback,
  requireSupabase: jest.fn(),
}));

import { sanitizeDialNumber } from '@/services/emergencyCallService';
import { formatElapsedTime } from '@/utils/format';
import {
  buildSmsBody,
  normalizeE164,
  shouldSendSmsFallback,
} from '../../supabase/functions/_shared/delivery';
import {
  escalationCutoff,
  isCronAuthorized,
} from '../../supabase/functions/process-incident-escalations/authorization';

describe('final-phase delivery helpers', () => {
  it('normalizes E.164 guardian phone numbers without guessing a country code', () => {
    expect(normalizeE164('+91 98765 43210')).toBe('+919876543210');
    expect(normalizeE164('9876543210')).toBeNull();
  });

  it('uses SMS only when enabled and push did not reach a linked guardian', () => {
    expect(shouldSendSmsFallback({ smsEnabled: true, phone: '+919876543210', hasLinkedAccount: true, pushDelivered: false })).toBe(true);
    expect(shouldSendSmsFallback({ smsEnabled: true, phone: '+919876543210', hasLinkedAccount: true, pushDelivered: true })).toBe(false);
    expect(shouldSendSmsFallback({ smsEnabled: false, phone: '+919876543210', hasLinkedAccount: false, pushDelivered: false })).toBe(false);
  });

  it('keeps real and demo SMS claims honest', () => {
    const demo = buildSmsBody({ ownerName: 'Aarav', incidentId: 'demo', isDemo: true });
    const real = buildSmsBody({ ownerName: 'Aarav', incidentId: 'real', isDemo: false, escalated: true });
    expect(demo).toContain('DEMO');
    expect(demo).toContain('No police or emergency service was contacted');
    expect(real).toContain('Emergency services are not contacted automatically');
    expect(real).not.toContain('Police notified');
  });

  it('requires a strong exact cron secret and clamps escalation timing', () => {
    const secret = 'a-strong-random-secret-value';
    expect(isCronAuthorized(secret, secret)).toBe(true);
    expect(isCronAuthorized('wrong', secret)).toBe(false);
    expect(isCronAuthorized('short', 'short')).toBe(false);
    expect(escalationCutoff(100_000, 5)).toBe(new Date(70_000).toISOString());
  });

  it('sanitizes a dialer handoff without placing a call itself', () => {
    expect(sanitizeDialNumber('+91 (112) #')).toBe('+91112#');
  });

  it('formats long-running incidents as hours instead of unbounded minutes', () => {
    expect(formatElapsedTime(17 * 60 + 27)).toBe('17:27');
    expect(formatElapsedTime(24 * 60 * 60 + 17 * 60 + 27)).toBe('24:17:27');
  });
});

describe('final-phase platform and RLS configuration', () => {
  const root = path.resolve(__dirname, '../..');
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/202607230002_final_phase.sql'), 'utf8');
  const appConfig = fs.readFileSync(path.join(root, 'app.json'), 'utf8');
  const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  const nativeMapCard = fs.readFileSync(path.join(root, 'components/MapCard.tsx'), 'utf8');
  const notificationService = fs.readFileSync(path.join(root, 'services/notificationService.ts'), 'utf8');
  const senderCountdown = fs.readFileSync(path.join(
    root,
    'android/app/src/main/java/com/corealert/prototype/CoreAlertNativeCountdown.kt',
  ), 'utf8');
  const evidenceService = fs.readFileSync(path.join(
    root,
    'android/app/src/main/java/com/corealert/prototype/CoreAlertEvidenceForegroundService.kt',
  ), 'utf8');
  const evidenceManagement = fs.readFileSync(path.join(
    root,
    'supabase/functions/manage-native-evidence/index.ts',
  ), 'utf8');
  const guardianIncident = fs.readFileSync(path.join(root, 'app/guardian-incident/[id].tsx'), 'utf8');
  const connectedContext = fs.readFileSync(path.join(root, 'store/ConnectedContext.tsx'), 'utf8');
  const delivery = fs.readFileSync(path.join(root, 'supabase/functions/_shared/sosDelivery.ts'), 'utf8');
  const sosOverlay = fs.readFileSync(path.join(root, 'components/SosOverlay.tsx'), 'utf8');

  it('enables Android background location only through the required permissions', () => {
    expect(appConfig).toContain('isAndroidBackgroundLocationEnabled');
    expect(appConfig).toContain('android.permission.FOREGROUND_SERVICE_LOCATION');
    expect(manifest).toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    expect(manifest).toContain('android.permission.FOREGROUND_SERVICE_LOCATION');
  });

  it('protects delivery and escalation data with RLS and server-managed writes', () => {
    expect(migration).toContain('alter table public.incident_recipients enable row level security');
    expect(migration).toContain('alter table public.incident_escalation_events enable row level security');
    expect(migration).toContain('revoke all on public.incident_recipients from anon, authenticated');
    expect(migration).not.toContain('for all to authenticated using (true)');
  });

  it('limits the responder console to Demo SOS incidents', () => {
    expect(migration).toContain("if not is_demo_incident then raise exception 'DEMO_INCIDENT_REQUIRED'");
    expect(migration).toContain('No police or emergency service was contacted');
  });

  it('does not mount Google Maps without native API-key metadata', () => {
    expect(manifest).not.toContain('com.google.android.geo.API_KEY');
    expect(nativeMapCard).not.toContain("from 'react-native-maps'");
    expect(nativeMapCard).toContain('Secure location preview');
  });

  it('keeps sender status silent and reserves the loud channel for guardian SOS delivery', () => {
    expect(senderCountdown).toContain('core-alert-sender-sos-status-v2');
    expect(senderCountdown).toContain('.setSilent(true)');
    expect(senderCountdown).not.toContain('DEFAULT_ALARM_ALERT_URI');
    expect(notificationService).toContain("data?.notificationType === 'guardian_sos'");
    expect(notificationService).toContain("data?.recipientRole === 'guardian'");
    expect(delivery).toContain("channelId: 'guardian-sos-alerts-v3'");
    expect(delivery).toContain("notificationType: 'guardian_sos'");
    expect(appConfig).toContain('"defaultChannel": "core-alert-general-updates-v2"');
    expect(manifest).toContain('android:value="core-alert-general-updates-v2"');
  });

  it('starts evidence without a Demo-mode gate and confirms activation immediately', () => {
    expect(evidenceService).not.toContain('disabled_in_demo');
    expect(evidenceService).toContain('recordEvidenceState(this, "starting", MODE_VIDEO)');
    expect(evidenceService).toContain('NotificationManager.IMPORTANCE_LOW');
    expect(sosOverlay).toContain("'SOS activated'");
    expect(sosOverlay).toContain("'Alerting your guardians and starting live protection.'");
  });

  it('registers signed-in devices for background push without requiring a Settings visit', () => {
    expect(connectedContext).toContain('registerForPushNotifications(user.id)');
    expect(notificationService).toContain('configureGuardianNotifications');
    expect(notificationService).toContain('getExpoPushTokenAsync');
  });

  it('makes private evidence available to assigned guardians in short secured segments', () => {
    expect(evidenceService).toContain('SEGMENT_DURATION_MS = 30_000L');
    expect(guardianIncident).toContain('subscribeToIncidentEvidence');
    expect(guardianIncident).toContain('createIncidentEvidenceUrl');
    expect(guardianIncident).toContain('not a continuous livestream');
    expect(evidenceManagement).not.toContain('DEMO_EVIDENCE_DISABLED');
    expect(evidenceManagement).toContain('captureBelongsToIncident');
  });
});
