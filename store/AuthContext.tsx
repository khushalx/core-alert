import type { Session, User } from '@supabase/supabase-js';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  loadProfile,
  requestPasswordReset,
  restoreSession,
  saveCloudProfile,
  signInWithPassword,
  signUpWithPassword,
  type SignUpInput,
} from '@/services/authService';
import { installSupabaseAppStateRefresh, isSupabaseConfigured, supabase } from '@/services/supabase';
import { deactivatePushTokens } from '@/services/notificationService';
import type { CloudProfile } from '@/types/cloud';

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: CloudProfile | null;
  error: string | null;
  signUp: (input: SignUpInput) => Promise<{ needsEmailConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateCloudProfile: (profile: Partial<CloudProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearAuthError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<CloudProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshProfileFor = useCallback(async (userId: string) => {
    try {
      const next = await loadProfile(userId);
      setProfile(next);
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : 'Your profile could not be loaded.');
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    const removeRefreshListener = installSupabaseAppStateRefresh();
    restoreSession().then((restoredSession) => {
      if (!active) return;
      setSession(restoredSession);
      setLoading(false);
      if (restoredSession?.user.id) void refreshProfileFor(restoredSession.user.id);
    }).catch(() => {
      if (!active) return;
      setError('Your saved session could not be restored. Please sign in again.');
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setError(null);
      if (nextSession?.user.id) void refreshProfileFor(nextSession.user.id);
      else setProfile(null);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
      removeRefreshListener();
    };
  }, [refreshProfileFor]);

  const signUp = useCallback(async (input: SignUpInput) => {
    setError(null);
    const result = await signUpWithPassword(input);
    return { needsEmailConfirmation: result.needsEmailConfirmation };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    await signInWithPassword(email, password);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    if (session?.user.id) await deactivatePushTokens(session.user.id).catch(() => undefined);
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw new Error('Core Alert could not sign you out. Try again.');
    setSession(null);
    setProfile(null);
  }, [session?.user.id]);

  const sendPasswordReset = useCallback(async (email: string) => {
    setError(null);
    await requestPasswordReset(email);
  }, []);

  const updateCloudProfile = useCallback(async (updates: Partial<CloudProfile>) => {
    if (!session?.user.id) throw new Error('Sign in to update your profile.');
    const next = await saveCloudProfile(session.user.id, updates);
    setProfile(next);
  }, [session?.user.id]);

  const refreshProfile = useCallback(async () => {
    if (session?.user.id) await refreshProfileFor(session.user.id);
  }, [refreshProfileFor, session?.user.id]);

  const value = useMemo<AuthContextValue>(() => ({
    configured: isSupabaseConfigured,
    loading,
    session,
    user: session?.user ?? null,
    profile,
    error,
    signUp,
    signIn,
    signOut,
    sendPasswordReset,
    updateCloudProfile,
    refreshProfile,
    clearAuthError: () => setError(null),
  }), [error, loading, profile, refreshProfile, sendPasswordReset, session, signIn, signOut, signUp, updateCloudProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
