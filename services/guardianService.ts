import AsyncStorage from '@react-native-async-storage/async-storage';

import { friendlySupabaseError, requireSupabase } from '@/services/supabase';
import type { GuardianProfileSummary, GuardianRelationship } from '@/types/cloud';

export const PENDING_FIRST_GUARDIAN_KEY = '@core-alert/pending-first-guardian';

export type GuardianInvitationInput = {
  guardianName: string;
  guardianEmail?: string;
  guardianPhone?: string;
  relationship?: string;
  isPrimary?: boolean;
};

export type GuardianInvitePreview = {
  relationshipId: string;
  protectedUserName: string;
  relationship: string | null;
  createdAt: string;
};

export function normalizeEmail(value?: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? '';
  return normalized || null;
}

export function validateGuardianCandidate(input: GuardianInvitationInput, callerEmail?: string | null, existingEmails: string[] = []): void {
  const email = normalizeEmail(input.guardianEmail);
  if (!input.guardianName.trim()) throw new Error('Enter the guardian’s name.');
  if (!email && !input.guardianPhone?.trim()) throw new Error('Add an email address or phone number.');
  if (email && email === normalizeEmail(callerEmail)) throw new Error('You cannot add yourself as your own guardian.');
  if (email && existingEmails.map(normalizeEmail).includes(email)) throw new Error('This guardian has already been added.');
}

export function buildGuardianInviteMessage(ownerName: string, invitation: GuardianRelationship): string {
  return `${ownerName} invited you to become a trusted guardian on Core Alert.\n\nInvite code: ${invitation.invite_code ?? 'Already used'}\n\nOpen: corealert://invite/${invitation.invite_code ?? ''}`;
}

export async function createGuardianInvitation(input: GuardianInvitationInput): Promise<GuardianRelationship> {
  const client = requireSupabase();
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) throw new Error('Sign in before adding a guardian.');

  const email = normalizeEmail(input.guardianEmail);
  const callerEmail = normalizeEmail(authData.user.email);
  validateGuardianCandidate(input, callerEmail);

  const { data: existing } = await client
    .from('guardian_relationships')
    .select('id')
    .eq('protected_user_id', authData.user.id)
    .neq('status', 'removed');
  if (email) {
    const { data: duplicates } = await client
      .from('guardian_relationships')
      .select('id')
      .eq('protected_user_id', authData.user.id)
      .ilike('guardian_email', email)
      .neq('status', 'removed');
    if ((duplicates ?? []).length > 0) throw new Error('This guardian has already been added.');
  }
  if (input.isPrimary && (existing ?? []).length > 0) {
    const { data: primary } = await client
      .from('guardian_relationships')
      .select('id')
      .eq('protected_user_id', authData.user.id)
      .eq('is_primary', true)
      .neq('status', 'removed')
      .maybeSingle();
    if (primary) throw new Error('Choose the existing primary guardian first, or add this guardian without the primary setting.');
  }

  const { data, error } = await client.from('guardian_relationships').insert({
    protected_user_id: authData.user.id,
    guardian_name: input.guardianName.trim(),
    guardian_email: email,
    guardian_phone: input.guardianPhone?.trim() || null,
    relationship: input.relationship?.trim() || 'Trusted contact',
    is_primary: Boolean(input.isPrimary),
  }).select('*').single();
  if (error) throw new Error(friendlySupabaseError(error, 'The guardian invitation could not be created.'));
  return data;
}

export async function getOwnedGuardianRelationships(): Promise<GuardianRelationship[]> {
  const client = requireSupabase();
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return [];
  const { data, error } = await client.from('guardian_relationships').select('*')
    .eq('protected_user_id', authData.user.id).neq('status', 'removed').order('is_primary', { ascending: false }).order('created_at');
  if (error) throw new Error(friendlySupabaseError(error, 'Guardians could not be loaded.'));
  return data ?? [];
}

export async function getIncomingGuardianRequests(): Promise<GuardianRelationship[]> {
  const client = requireSupabase();
  const { data, error } = await client.from('guardian_relationships').select('*').eq('status', 'pending').order('created_at', { ascending: false });
  if (error) throw new Error(friendlySupabaseError(error, 'Guardian requests could not be loaded.'));
  return data ?? [];
}

export async function getPeopleIProtect(): Promise<GuardianRelationship[]> {
  const client = requireSupabase();
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return [];
  const { data, error } = await client.from('guardian_relationships').select('*')
    .eq('guardian_user_id', authData.user.id).eq('status', 'accepted').order('accepted_at', { ascending: false });
  if (error) throw new Error(friendlySupabaseError(error, 'Protected people could not be loaded.'));
  return data ?? [];
}

export async function respondToGuardianInvitation(code: string, decision: 'accepted' | 'declined'): Promise<GuardianRelationship> {
  const client = requireSupabase();
  const normalized = code.trim().toUpperCase();
  if (!/^CA-\d{4}$/.test(normalized)) throw new Error('Enter a valid invite code such as CA-4821.');
  const { data, error } = await client.rpc('respond_to_guardian_invitation', { invitation_code: normalized, decision });
  if (error) {
    const message = error.message;
    if (message.includes('SELF_INVITE')) throw new Error('You cannot accept your own guardian invitation.');
    if (message.includes('DUPLICATE_GUARDIAN')) throw new Error('You are already linked to this person.');
    if (message.includes('INVITE_EMAIL_MISMATCH')) throw new Error('This invitation was sent to a different email address.');
    if (message.includes('INVALID_OR_USED_INVITE')) throw new Error('This invite code is invalid, expired, or already used.');
    throw new Error(friendlySupabaseError(error, 'The guardian invitation could not be updated.'));
  }
  const relationship = data?.[0];
  if (!relationship) throw new Error('This invite code is invalid, expired, or already used.');
  return relationship;
}

export async function previewGuardianInvitation(code: string): Promise<GuardianInvitePreview> {
  const client = requireSupabase();
  const normalized = code.trim().toUpperCase();
  if (!/^CA-\d{4}$/.test(normalized)) throw new Error('Enter a valid invite code such as CA-4821.');
  const { data, error } = await client.rpc('preview_guardian_invitation', { invitation_code: normalized });
  if (error || !data?.[0]) {
    if (error?.message.includes('SELF_INVITE')) throw new Error('You cannot accept your own guardian invitation.');
    if (error?.message.includes('INVITE_EMAIL_MISMATCH')) throw new Error('This invitation was sent to a different email address.');
    throw new Error('This invite code is invalid, expired, or already used.');
  }
  return {
    relationshipId: data[0].relationship_id,
    protectedUserName: data[0].protected_user_name,
    relationship: data[0].relationship,
    createdAt: data[0].created_at,
  };
}

export async function setPrimaryGuardian(relationshipId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc('set_primary_guardian', { relationship_id: relationshipId });
  if (error) throw new Error(friendlySupabaseError(error, 'The primary guardian could not be changed.'));
}

export async function removeGuardianRelationship(relationshipId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('guardian_relationships').update({ status: 'removed', is_primary: false, invite_code: null }).eq('id', relationshipId);
  if (error) throw new Error(friendlySupabaseError(error, 'The guardian could not be removed.'));
}

export async function getGuardianProfileSummary(profileId: string): Promise<GuardianProfileSummary | null> {
  const client = requireSupabase();
  const { data, error } = await client.rpc('get_guardian_profile_summary', { target_profile_id: profileId });
  if (error) throw new Error(friendlySupabaseError(error, 'The protected user profile could not be loaded.'));
  return data?.[0] ?? null;
}

export async function importPendingFirstGuardian(): Promise<GuardianRelationship | null> {
  const raw = await AsyncStorage.getItem(PENDING_FIRST_GUARDIAN_KEY);
  if (!raw) return null;
  try {
    const input = JSON.parse(raw) as GuardianInvitationInput;
    const result = await createGuardianInvitation(input);
    await AsyncStorage.removeItem(PENDING_FIRST_GUARDIAN_KEY);
    return result;
  } catch (error) {
    if (error instanceof SyntaxError) await AsyncStorage.removeItem(PENDING_FIRST_GUARDIAN_KEY);
    throw error;
  }
}
