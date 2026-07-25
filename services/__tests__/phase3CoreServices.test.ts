/// <reference types="jest" />

const mockRequireSupabase = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('@/services/supabase', () => ({
  requireSupabase: () => mockRequireSupabase(),
  friendlySupabaseError: (_error: unknown, fallback: string) => fallback,
}));

import { restoreSession, signUpWithPassword } from '@/services/authService';
import {
  createGuardianInvitation,
  respondToGuardianInvitation,
  validateGuardianCandidate,
} from '@/services/guardianService';
import {
  acknowledgeIncident,
  assignGuardiansToIncident,
  createIncident,
  resolveIncident,
  shouldPersistLocation,
  subscribeToIncidentGuardians,
} from '@/services/incidentService';
import { OfflineLocationQueue, type QueueStorage } from '@/services/offlineLocationQueue';
import { canSendIncidentNotification, isUuid } from '../../supabase/functions/send-sos-notifications/authorization';
import type { GuardianRelationship, IncidentGuardian } from '@/types/cloud';

const userId = '11111111-1111-4111-8111-111111111111';
const incidentId = '33333333-3333-4333-8333-333333333333';

beforeEach(() => mockRequireSupabase.mockReset());

it('creates an account with identity metadata', async () => {
  const signUp = jest.fn().mockResolvedValue({ data: { session: null, user: { id: userId } }, error: null });
  mockRequireSupabase.mockReturnValue({ auth: { signUp } });
  const result = await signUpWithPassword({ fullName: 'Aarav Shah', email: 'AARAV@example.com', password: 'securepass', phone: '+91 99999 99999', bloodGroup: '', allergies: '', medicalNotes: '' });
  expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ email: 'aarav@example.com', options: { data: { full_name: 'Aarav Shah', phone: '+91 99999 99999' } } }));
  expect(result.needsEmailConfirmation).toBe(true);
});

it('restores a persisted Supabase session', async () => {
  const session = { access_token: 'saved-session', user: { id: userId } };
  mockRequireSupabase.mockReturnValue({ auth: { getSession: jest.fn().mockResolvedValue({ data: { session }, error: null }) } });
  await expect(restoreSession()).resolves.toBe(session);
});

function invitation(overrides: Partial<GuardianRelationship> = {}): GuardianRelationship {
  return { id: '22222222-2222-4222-8222-222222222222', protected_user_id: userId, guardian_user_id: null, guardian_name: 'Maya', guardian_email: 'maya@example.com', guardian_phone: null, relationship: 'Sister', status: 'pending', is_primary: false, invite_code: 'CA-4821', created_at: new Date().toISOString(), accepted_at: null, ...overrides };
}

function guardianCreationClient(duplicate = false) {
  let call = 0;
  const created = invitation();
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: userId, email: 'owner@example.com' } }, error: null }) },
    from: jest.fn(() => {
      call += 1;
      const chain: Record<string, jest.Mock> = {};
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.ilike = jest.fn(() => chain);
      chain.neq = jest.fn().mockResolvedValue({ data: call === 2 && duplicate ? [{ id: 'duplicate' }] : [], error: null });
      chain.insert = jest.fn(() => ({ select: () => ({ single: async () => ({ data: created, error: null }) }) }));
      return chain;
    }),
  };
}

it('creates a guardian invitation with a shareable code', async () => {
  mockRequireSupabase.mockReturnValue(guardianCreationClient());
  const created = await createGuardianInvitation({ guardianName: 'Maya', guardianEmail: 'maya@example.com', relationship: 'Sister' });
  expect(created.invite_code).toBe('CA-4821');
});

it('accepts a valid guardian invitation', async () => {
  const accepted = invitation({ status: 'accepted', guardian_user_id: '44444444-4444-4444-8444-444444444444', invite_code: null });
  mockRequireSupabase.mockReturnValue({ rpc: jest.fn().mockResolvedValue({ data: [accepted], error: null }) });
  await expect(respondToGuardianInvitation('ca-4821', 'accepted')).resolves.toEqual(accepted);
});

it('rejects an invalid or reused invitation code', async () => {
  mockRequireSupabase.mockReturnValue({ rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'INVALID_OR_USED_INVITE' } }) });
  await expect(respondToGuardianInvitation('CA-4821', 'accepted')).rejects.toThrow('invalid, expired, or already used');
});

it('prevents self-invites', () => {
  expect(() => validateGuardianCandidate({ guardianName: 'Aarav', guardianEmail: 'owner@example.com' }, 'OWNER@example.com')).toThrow('cannot add yourself');
});

it('prevents duplicate guardian emails', () => {
  expect(() => validateGuardianCandidate({ guardianName: 'Maya', guardianEmail: 'maya@example.com' }, 'owner@example.com', ['MAYA@example.com'])).toThrow('already been added');
});

it('creates a real incident and stores its original location', async () => {
  const created = { id: incidentId, user_id: userId, status: 'active', activation_source: 'manual-test', is_demo: true, started_at: new Date().toISOString() };
  const rpc = jest.fn().mockResolvedValue({ data: created, error: null });
  mockRequireSupabase.mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }) },
    rpc,
  });
  const result = await createIncident({
    activationId: '6bce7cc4-60dc-44f0-a54d-f780bc07db9b',
    activationSource: 'manual-test',
    isDemo: true,
    location: { latitude: 19.1, longitude: 72.8, accuracy: 8 },
  });
  expect(result.id).toBe(incidentId);
  expect(rpc).toHaveBeenCalledWith('create_or_restore_incident', expect.objectContaining({
    activation_id: '6bce7cc4-60dc-44f0-a54d-f780bc07db9b',
    requested_latitude: 19.1,
  }));
});

it('assigns accepted guardians through the protected database function', async () => {
  const assigned = [{ id: 'a', incident_id: incidentId }] as IncidentGuardian[];
  const rpc = jest.fn().mockResolvedValue({ data: assigned, error: null });
  mockRequireSupabase.mockReturnValue({ rpc });
  await expect(assignGuardiansToIncident(incidentId)).resolves.toEqual(assigned);
  expect(rpc).toHaveBeenCalledWith('assign_incident_guardians', { target_incident_id: incidentId });
});

it('throttles tiny, frequent location changes', () => {
  const previous = { latitude: 19.076, longitude: 72.8777, accuracy: 5 };
  expect(shouldPersistLocation(previous, { latitude: 19.076001, longitude: 72.877701, accuracy: 5 }, 1_000, 3_000)).toBe(false);
  expect(shouldPersistLocation(previous, { latitude: 19.077, longitude: 72.8787, accuracy: 5 }, 1_000, 3_000)).toBe(true);
  expect(shouldPersistLocation(previous, previous, 1_000, 9_000)).toBe(true);
});

it('updates only the assigned guardian acknowledgement', async () => {
  const response = { id: 'assignment', incident_id: incidentId, acknowledgement_status: 'responding' } as IncidentGuardian;
  const rpc = jest.fn().mockResolvedValue({ data: [response], error: null });
  mockRequireSupabase.mockReturnValue({ rpc });
  await expect(acknowledgeIncident(incidentId, 'responding')).resolves.toEqual(response);
  expect(rpc).toHaveBeenCalledWith('acknowledge_incident', { target_incident_id: incidentId, response: 'responding' });
});

it('delivers realtime guardian acknowledgement events to the subscriber', () => {
  let databaseCallback: (() => void) | null = null;
  const callback = jest.fn();
  const channel: { on: jest.Mock; subscribe: jest.Mock } = { on: jest.fn(), subscribe: jest.fn() };
  channel.on.mockImplementation((_event, _filter, next: () => void) => { databaseCallback = next; return channel; });
  channel.subscribe.mockImplementation(() => channel);
  mockRequireSupabase.mockReturnValue({ channel: jest.fn(() => channel), removeChannel: jest.fn() });
  const stop = subscribeToIncidentGuardians(incidentId, callback);
  expect(databaseCallback).not.toBeNull();
  (databaseCallback as unknown as () => void)();
  expect(callback).toHaveBeenCalledTimes(1);
  stop();
});

it('resolves an active incident without changing ownership', async () => {
  const resolved = { id: incidentId, user_id: userId, status: 'resolved' };
  const rpc = jest.fn().mockResolvedValue({ data: resolved, error: null });
  mockRequireSupabase.mockReturnValue({ rpc });
  await expect(resolveIncident(incidentId)).resolves.toEqual(resolved);
  expect(rpc).toHaveBeenCalledWith('resolve_incident_idempotent', {
    target_incident_id: incidentId,
  });
});

it('falls back to an owner-scoped update when the resolve RPC is unavailable', async () => {
  const resolved = { id: incidentId, user_id: userId, status: 'resolved' };
  const maybeSingle = jest.fn().mockResolvedValue({ data: resolved, error: null });
  const select = jest.fn(() => ({ maybeSingle }));
  const statusEq = jest.fn(() => ({ select }));
  const idEq = jest.fn(() => ({ eq: statusEq }));
  const update = jest.fn(() => ({ eq: idEq }));
  const from = jest.fn(() => ({ update }));
  const rpc = jest.fn().mockResolvedValue({
    data: null,
    error: { code: 'PGRST202', message: 'Could not find the function public.resolve_incident_idempotent' },
  });
  mockRequireSupabase.mockReturnValue({ rpc, from });

  await expect(resolveIncident(incidentId)).resolves.toEqual(resolved);
  expect(update).toHaveBeenCalledWith(expect.objectContaining({
    status: 'resolved',
    ended_at: expect.any(String),
  }));
  expect(idEq).toHaveBeenCalledWith('id', incidentId);
  expect(statusEq).toHaveBeenCalledWith('status', 'active');
});

it('queues offline locations and retries from the original incident id', async () => {
  const memory = new Map<string, string>();
  const storage: QueueStorage = { getItem: async (key) => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); } };
  const queue = new OfflineLocationQueue(storage);
  await queue.enqueue({ incidentId, latitude: 19, longitude: 72, accuracy: 5, recordedAt: '2026-07-23T00:00:00Z' });
  const sender = jest.fn().mockResolvedValue(undefined);
  await expect(queue.flush(sender)).resolves.toEqual({ sent: 1, remaining: 0 });
  expect(sender).toHaveBeenCalledWith(expect.objectContaining({ incidentId }));
});

it('flushes only the active incident queue and leaves unrelated incidents untouched', async () => {
  const memory = new Map<string, string>();
  const storage: QueueStorage = {
    getItem: async (key) => memory.get(key) ?? null,
    setItem: async (key, value) => { memory.set(key, value); },
  };
  const queue = new OfflineLocationQueue(storage);
  await queue.enqueue({ incidentId: 'old-incident', latitude: 1, longitude: 2, accuracy: null, recordedAt: '2026-07-22T00:00:00Z' });
  await queue.enqueue({ incidentId, latitude: 19, longitude: 72, accuracy: 5, recordedAt: '2026-07-23T00:00:00Z' });
  const sender = jest.fn().mockResolvedValue(undefined);
  await expect(queue.flushIncident(incidentId, sender)).resolves.toEqual({ sent: 1, remaining: 0 });
  expect(sender).toHaveBeenCalledTimes(1);
  await expect(queue.read()).resolves.toEqual([expect.objectContaining({ incidentId: 'old-incident' })]);
});

it('authorizes the notification Edge Function only for the incident owner', () => {
  expect(canSendIncidentNotification(userId, userId)).toBe(true);
  expect(canSendIncidentNotification('unrelated', userId)).toBe(false);
  expect(isUuid(incidentId)).toBe(true);
  expect(isUuid('../incident')).toBe(false);
});
