import type { Session } from '@supabase/supabase-js';

import { friendlySupabaseError, requireSupabase } from '@/services/supabase';
import type { CloudProfile } from '@/types/cloud';

export type SignUpInput = {
  fullName: string;
  email: string;
  password: string;
  phone: string;
  bloodGroup: string;
  allergies: string;
  medicalNotes: string;
};

export type AuthResult = {
  session: Session | null;
  needsEmailConfirmation: boolean;
};

export async function restoreSession(): Promise<Session | null> {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(friendlySupabaseError(error, 'Your saved session could not be restored.'));
  return data.session;
}

export async function signUpWithPassword(input: SignUpInput): Promise<AuthResult> {
  const client = requireSupabase();
  const { data, error } = await client.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      data: { full_name: input.fullName.trim(), phone: input.phone.trim() || null },
    },
  });
  if (error) throw new Error(friendlySupabaseError(error, 'Your account could not be created.'));

  if (data.session) {
    const { error: profileError } = await client.from('profiles').update({
      full_name: input.fullName.trim(),
      phone: input.phone.trim() || null,
      blood_group: input.bloodGroup.trim() || null,
      allergies: input.allergies.trim() || null,
      medical_notes: input.medicalNotes.trim() || null,
    }).eq('id', data.user?.id ?? '');
    if (profileError) throw new Error(friendlySupabaseError(profileError, 'Your profile could not be completed.'));
  }

  return { session: data.session, needsEmailConfirmation: !data.session };
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(friendlySupabaseError(error, 'Core Alert could not sign you in.'));
}

export async function requestPasswordReset(email: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: 'corealert://reset-password',
  });
  if (error) throw new Error(friendlySupabaseError(error, 'The reset email could not be sent.'));
}

export async function loadProfile(userId: string): Promise<CloudProfile | null> {
  const client = requireSupabase();
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(friendlySupabaseError(error, 'Your profile could not be loaded.'));
  return data;
}

export async function saveCloudProfile(userId: string, profile: Partial<CloudProfile>): Promise<CloudProfile> {
  const client = requireSupabase();
  const { data, error } = await client.from('profiles').update(profile).eq('id', userId).select('*').single();
  if (error) throw new Error(friendlySupabaseError(error, 'Your profile could not be saved.'));
  return data;
}
