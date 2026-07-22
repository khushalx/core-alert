import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, StatusBadge } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';

const PENDING_GUARDIAN_KEY = '@core-alert/pending-first-guardian';

type SignUpForm = {
  fullName: string; email: string; password: string; phone: string;
  bloodGroup: string; allergies: string; medicalNotes: string;
  guardianName: string; guardianEmail: string; guardianPhone: string; guardianRelationship: string;
};

const empty: SignUpForm = { fullName: '', email: '', password: '', phone: '', bloodGroup: '', allergies: '', medicalNotes: '', guardianName: '', guardianEmail: '', guardianPhone: '', guardianRelationship: '' };

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const { location, requestLocationPermission } = useApp();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const update = (field: keyof SignUpForm, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const next = () => {
    setError('');
    if (step === 0) {
      if (!form.fullName.trim() || !/^\S+@\S+\.\S+$/.test(form.email.trim()) || form.password.length < 8) {
        setError('Enter your name, a valid email, and a password with at least 8 characters.'); return;
      }
    }
    if (step === 1 && form.phone.trim() && form.phone.replace(/\D/g, '').length < 8) {
      setError('Enter a valid phone number or leave it blank.'); return;
    }
    setStep((current) => Math.min(2, current + 1));
  };

  const submit = async () => {
    setLoading(true); setError('');
    try {
      if (form.guardianName.trim()) {
        await AsyncStorage.setItem(PENDING_GUARDIAN_KEY, JSON.stringify({
          guardianName: form.guardianName.trim(), guardianEmail: form.guardianEmail.trim(), guardianPhone: form.guardianPhone.trim(), relationship: form.guardianRelationship.trim() || 'Trusted contact',
        }));
      }
      const result = await signUp(form);
      if (result.needsEmailConfirmation) {
        router.replace({ pathname: '/sign-in', params: { created: '1' } });
      } else {
        router.replace('/');
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Your account could not be created.');
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View><Text style={styles.step}>STEP {step + 1} OF 3</Text><View style={styles.progressRow}>{[0, 1, 2].map((item) => <View key={item} style={[styles.progress, item <= step && styles.progressActive]} />)}</View></View>
          {step === 0 ? <FormCard icon="person-outline" title="Create your account" subtitle="Use an email you can access on both devices.">
            <Field label="Full name" value={form.fullName} onChangeText={(value) => update('fullName', value)} autoCapitalize="words" />
            <Field label="Email" value={form.email} onChangeText={(value) => update('email', value)} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Field label="Password" value={form.password} onChangeText={(value) => update('password', value)} secureTextEntry autoComplete="new-password" />
          </FormCard> : null}
          {step === 1 ? <FormCard icon="medkit-outline" title="Emergency basics" subtitle="These details are stored in your protected Supabase profile.">
            <Field label="Phone number" value={form.phone} onChangeText={(value) => update('phone', value)} keyboardType="phone-pad" />
            <Field label="Blood group (optional)" value={form.bloodGroup} onChangeText={(value) => update('bloodGroup', value)} autoCapitalize="characters" />
            <Field label="Allergies (optional)" value={form.allergies} onChangeText={(value) => update('allergies', value)} />
            <Field label="Medical notes (optional)" value={form.medicalNotes} onChangeText={(value) => update('medicalNotes', value)} multiline />
          </FormCard> : null}
          {step === 2 ? <FormCard icon="shield-checkmark-outline" title="Finish safety setup" subtitle="Location and a first guardian can be completed now or later.">
            <View style={styles.permissionRow}><View style={styles.permissionCopy}><Text style={styles.label}>Location permission</Text><Text style={styles.helper}>Required for incident and live location sharing.</Text></View><StatusBadge label={location.permission === 'granted' ? 'Ready' : 'Optional now'} tone={location.permission === 'granted' ? 'success' : 'warning'} /></View>
            {location.permission !== 'granted' ? <Button label="Allow location" variant="secondary" loading={location.loading} onPress={requestLocationPermission} /> : null}
            <View style={styles.divider} />
            <Text style={styles.optionalTitle}>First guardian (optional)</Text>
            <Field label="Name" value={form.guardianName} onChangeText={(value) => update('guardianName', value)} />
            <Field label="Email" value={form.guardianEmail} onChangeText={(value) => update('guardianEmail', value)} keyboardType="email-address" autoCapitalize="none" />
            <Field label="Phone" value={form.guardianPhone} onChangeText={(value) => update('guardianPhone', value)} keyboardType="phone-pad" />
            <Field label="Relationship" value={form.guardianRelationship} onChangeText={(value) => update('guardianRelationship', value)} />
          </FormCard> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {step < 2 ? <Button label="Continue" onPress={next} /> : <Button label="Create account" loading={loading} onPress={submit} />}
          <Button label={step === 0 ? 'Back to welcome' : 'Back'} variant="ghost" onPress={() => step === 0 ? router.back() : setStep((current) => current - 1)} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FormCard({ icon, title, subtitle, children }: React.PropsWithChildren<{ icon: React.ComponentProps<typeof Ionicons>['name']; title: string; subtitle: string }>) {
  return <View><View style={styles.intro}><View style={styles.icon}><Ionicons name={icon} size={24} color={colors.navy} /></View><View style={styles.introCopy}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View></View><Card style={styles.card}>{children}</Card></View>;
}
function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.textMuted} style={[styles.input, props.multiline && styles.multiline]} {...props} /></View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 }, content: { padding: spacing.lg, gap: 14, paddingBottom: 32 },
  step: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.7 }, progressRow: { flexDirection: 'row', gap: 6, marginTop: 8 }, progress: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border }, progressActive: { backgroundColor: colors.navy },
  intro: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 }, icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E8EEF4', alignItems: 'center', justifyContent: 'center' }, introCopy: { flex: 1, marginLeft: 12 }, title: { color: colors.text, fontSize: 21, fontWeight: '800' }, subtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  card: { gap: 14 }, field: { gap: 7 }, label: { color: colors.text, fontSize: 13, fontWeight: '700' }, helper: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 3 }, input: { minHeight: 50, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.small, color: colors.text, backgroundColor: colors.white, paddingHorizontal: 13, fontSize: 14 }, multiline: { minHeight: 78, paddingTop: 12, textAlignVertical: 'top' }, error: { color: colors.redDark, backgroundColor: colors.redSoft, borderRadius: 10, padding: 11, fontSize: 12, lineHeight: 18 },
  permissionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, permissionCopy: { flex: 1 }, divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 }, optionalTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
});
