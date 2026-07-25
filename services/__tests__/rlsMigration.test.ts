/// <reference types="jest" />
/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

it('defines scoped RLS policies instead of unrelated-account read access', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/202607230001_phase3.sql'), 'utf8');
  expect(sql).toContain('alter table public.incidents enable row level security');
  expect(sql).toContain('private.is_assigned_guardian(id, (select auth.uid()))');
  expect(sql).toContain('user_id = (select auth.uid())');
  expect(sql).not.toMatch(/create policy[\s\S]{0,180}to authenticated[\s\S]{0,80}using\s*\(\s*true\s*\)/i);
});

it('keeps native protection secrets server-managed and notification delivery reads scoped', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/202607230003_background_protection.sql'), 'utf8');
  expect(sql).toContain('alter table public.protection_devices enable row level security');
  expect(sql).toContain('revoke all on public.protection_devices from anon, authenticated');
  expect(sql).toContain('guardian_user_id = (select auth.uid())');
  expect(sql).toContain('private.owns_incident(incident_id, (select auth.uid()))');
  expect(sql).toContain('acknowledge_incident_from_notification');
  expect(sql).toContain('alter publication supabase_realtime add table public.notification_deliveries');
  expect(sql).not.toMatch(/create policy[\s\S]{0,180}protection_devices[\s\S]{0,100}using\s*\(\s*true\s*\)/i);
});

it('keeps emergency evidence private to the owner and assigned incident guardians', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/202607240004_native_evidence.sql'), 'utf8');
  expect(sql).toMatch(/insert into storage\.buckets\s*\(\s*id,\s*name,\s*public,/);
  expect(sql).toMatch(/values\s*\(\s*'incident-evidence',\s*'incident-evidence',\s*false,/);
  expect(sql).toContain('alter table public.incident_evidence enable row level security');
  expect(sql).toContain('user_id = (select auth.uid())');
  expect(sql).toContain('private.is_assigned_guardian(incident_id, (select auth.uid()))');
  expect(sql).toContain("bucket_id = 'incident-evidence'");
  expect(sql).toContain('alter publication supabase_realtime add table public.incident_evidence');
  expect(sql).not.toMatch(/create policy[\s\S]{0,180}incident_evidence[\s\S]{0,100}using\s*\(\s*true\s*\)/i);
});

it('enforces one active incident and idempotent lifecycle database operations', () => {
  const sql = readFileSync(resolve(
    process.cwd(),
    'supabase/migrations/202607250005_sos_lifecycle_reliability.sql',
  ), 'utf8');
  expect(sql).toContain('create unique index if not exists one_active_incident_per_user');
  expect(sql).toContain('create or replace function public.create_or_restore_incident');
  expect(sql).toContain('pg_advisory_xact_lock');
  expect(sql).toContain('create or replace function public.resolve_incident_idempotent');
  expect(sql).toContain('create or replace function public.append_active_incident_location');
  expect(sql).toContain('create unique index if not exists one_initial_delivery_per_incident');
});

it('uses one native monotonic volume sequence manager in both Android entry points', () => {
  const accessibility = readFileSync(resolve(
    process.cwd(),
    'android/app/src/main/java/com/corealert/prototype/CoreAlertAccessibilityService.kt',
  ), 'utf8');
  const activity = readFileSync(resolve(
    process.cwd(),
    'android/app/src/main/java/com/corealert/prototype/MainActivity.kt',
  ), 'utf8');
  const manager = readFileSync(resolve(
    process.cwd(),
    'modules/core-alert-hardware/android/src/main/java/com/corealert/prototype/CoreAlertVolumeSequenceManager.kt',
  ), 'utf8');
  expect(accessibility).toContain('CoreAlertVolumeSequenceManager.recordPress');
  expect(activity).toContain('CoreAlertVolumeSequenceManager.recordPress');
  expect(accessibility).not.toContain('ArrayDeque');
  expect(manager).toContain('SystemClock.elapsedRealtime()');
  expect(manager).toContain('REQUIRED_PRESSES = 5');
  expect(manager).toContain('PRESS_WINDOW_MS = 3_000L');
});

it('starts native recording only across the visible countdown activity boundary', () => {
  const accessibility = readFileSync(resolve(
    process.cwd(),
    'android/app/src/main/java/com/corealert/prototype/CoreAlertAccessibilityService.kt'
  ), 'utf8');
  const countdown = readFileSync(resolve(
    process.cwd(),
    'android/app/src/main/java/com/corealert/prototype/CoreAlertEmergencyCountdownActivity.kt'
  ), 'utf8');
  const evidenceService = readFileSync(resolve(
    process.cwd(),
    'android/app/src/main/java/com/corealert/prototype/CoreAlertEvidenceForegroundService.kt'
  ), 'utf8');

  expect(accessibility).not.toContain('CoreAlertEvidenceForegroundService');
  expect(accessibility).not.toContain('MediaRecorder');
  expect(countdown).toContain('CoreAlertEvidenceForegroundService.startFromVisibleActivity');
  expect(evidenceService).toContain('.withAudioEnabled()');
  expect(evidenceService).toContain('MediaRecorder.AudioEncoder.AAC');
  expect(evidenceService).toContain('CoreAlertEvidenceUploadWorker.enqueue');
});
