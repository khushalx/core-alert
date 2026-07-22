import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';
import type { EmergencyProfile } from '@/types';

export default function EmergencyProfileScreen() {
  const { state, updateProfile } = useApp();
  const { profile: cloudProfile, updateCloudProfile } = useAuth();
  const [profile, setProfile] = useState<EmergencyProfile>(() => ({
    fullName: cloudProfile?.full_name ?? state.profile.fullName,
    phone: cloudProfile?.phone ?? state.profile.phone,
    bloodGroup: cloudProfile?.blood_group ?? state.profile.bloodGroup,
    allergies: cloudProfile?.allergies ?? state.profile.allergies,
    medicalNotes: cloudProfile?.medical_notes ?? state.profile.medicalNotes,
    preferredLanguage: cloudProfile?.preferred_language ?? state.profile.preferredLanguage,
  }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const update = (field: keyof EmergencyProfile, value: string) => setProfile((current) => ({ ...current, [field]: value }));
  const save = async () => {
    const clean = { ...profile, fullName: profile.fullName.trim() || 'Core Alert user' };
    setLoading(true); setError('');
    try {
      await updateCloudProfile({
        full_name: clean.fullName,
        phone: clean.phone.trim() || null,
        blood_group: clean.bloodGroup.trim() || null,
        allergies: clean.allergies.trim() || null,
        medical_notes: clean.medicalNotes.trim() || null,
        preferred_language: clean.preferredLanguage.trim() || 'English',
      });
      updateProfile(clean);
      router.back();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The emergency profile could not be saved.');
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={styles.title}>Emergency profile</Text>
            <Text style={styles.subtitle}>Stored in your protected Supabase profile and cached locally for fast display.</Text>
          </View>
          <ProfileSection title="Identity">
            <Field label="Full name" value={profile.fullName} onChangeText={(value) => update('fullName', value)} autoCapitalize="words" />
            <Field label="Phone number" value={profile.phone} onChangeText={(value) => update('phone', value)} keyboardType="phone-pad" />
            <Field label="Preferred language" value={profile.preferredLanguage} onChangeText={(value) => update('preferredLanguage', value)} />
          </ProfileSection>
          <ProfileSection title="Medical information">
            <Field label="Blood group" value={profile.bloodGroup} onChangeText={(value) => update('bloodGroup', value)} placeholder="e.g. O+" autoCapitalize="characters" />
            <Field label="Allergies" value={profile.allergies} onChangeText={(value) => update('allergies', value)} placeholder="e.g. Penicillin" />
            <Field label="Medical notes" value={profile.medicalNotes} onChangeText={(value) => update('medicalNotes', value)} placeholder="Relevant conditions or notes" multiline />
          </ProfileSection>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="Save emergency profile" icon="checkmark" loading={loading} onPress={() => void save()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ProfileSection({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <View>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <Card style={styles.card}>{children}</Card>
    </View>
  );
}

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.textMuted} style={[styles.input, props.multiline && styles.multiline]} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: 18, paddingBottom: 32 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 5 },
  sectionTitle: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 8 },
  card: { paddingBottom: 3 },
  field: { marginBottom: 16 },
  label: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { minHeight: 50, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.small, color: colors.text, backgroundColor: colors.white, paddingHorizontal: 13, fontSize: 14 },
  multiline: { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
  error: { color: colors.redDark, backgroundColor: colors.redSoft, borderRadius: 10, padding: 11, fontSize: 12 },
});
