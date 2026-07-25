import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, StatusBadge } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { buildGuardianInviteMessage } from '@/services/guardianService';
import { useAuth } from '@/store/AuthContext';
import { useConnected } from '@/store/ConnectedContext';

type Form = { guardianName: string; guardianEmail: string; guardianPhone: string; relationship: string; isPrimary: boolean };
const empty: Form = { guardianName: '', guardianEmail: '', guardianPhone: '', relationship: '', isPrimary: false };

export default function GuardianFormScreen() {
  const { profile } = useAuth();
  const { createGuardian } = useConnected();
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const update = (field: keyof Form, value: string | boolean) => setForm((current) => ({ ...current, [field]: value }));
  const save = async () => {
    setLoading(true); setError('');
    try {
      const created = await createGuardian(form);
      if (created.guardian_email && created.invite_code) {
        await Share.share({ message: buildGuardianInviteMessage(profile?.full_name ?? 'A Core Alert user', created) });
      }
      router.replace({ pathname: '/guardian/[id]', params: { id: created.id } });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The guardian could not be saved.');
    } finally { setLoading(false); }
  };
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}><View style={styles.icon}><Ionicons name="person-add-outline" size={25} color={colors.navy} /></View><View style={styles.introCopy}><Text style={styles.title}>Add a trusted guardian</Text><Text style={styles.subtitle}>Email links another Core Alert account. A phone number can receive server-side SMS fallback only when the provider is configured.</Text></View></View>
          <Card style={styles.card}>
            <Field label="Full name" value={form.guardianName} onChangeText={(value) => update('guardianName', value)} autoCapitalize="words" placeholder="e.g. Maya Sharma" />
            <Field label="Email address (for linking)" value={form.guardianEmail} onChangeText={(value) => update('guardianEmail', value)} keyboardType="email-address" autoCapitalize="none" placeholder="name@example.com" />
            <Field label="Phone number" value={form.guardianPhone} onChangeText={(value) => update('guardianPhone', value)} keyboardType="phone-pad" placeholder="+91 98765 43210" />
            <Text style={styles.phoneHint}>Include the country code, such as +91. Saving a number does not claim that an SMS was delivered.</Text>
            <Field label="Relationship" value={form.relationship} onChangeText={(value) => update('relationship', value)} placeholder="e.g. Sister" />
            <View style={styles.primaryRow}><View style={styles.primaryCopy}><View style={styles.primaryTitleRow}><Text style={styles.primaryTitle}>Primary guardian</Text>{form.isPrimary ? <StatusBadge label="Selected" tone="info" /> : null}</View><Text style={styles.primaryText}>Only one active guardian can be primary.</Text></View><Switch value={form.isPrimary} onValueChange={(value) => update('isPrimary', value)} trackColor={{ false: colors.borderStrong, true: colors.navy }} thumbColor={colors.white} /></View>
          </Card>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="Save guardian" icon="checkmark" loading={loading} onPress={save} />
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.textMuted} style={styles.input} {...props} /></View>; }
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 }, content: { padding: spacing.lg, gap: 14, paddingBottom: 30 },
  intro: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 }, icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }, introCopy: { flex: 1, marginLeft: 12 }, title: { color: colors.text, fontSize: 20, fontWeight: '800' }, subtitle: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  card: { paddingBottom: 4 }, field: { marginBottom: 16 }, label: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 7 }, input: { minHeight: 52, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.small, color: colors.text, backgroundColor: colors.surfaceElevated, paddingHorizontal: 13, fontSize: 14 },
  phoneHint: { color: colors.textMuted, fontSize: 10, lineHeight: 15, marginTop: -12, marginBottom: 16 },
  primaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }, primaryCopy: { flex: 1, paddingRight: 14 }, primaryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, primaryTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, primaryText: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 4 }, error: { color: colors.redDark, backgroundColor: colors.redSoft, borderRadius: 10, padding: 11, fontSize: 12 },
});
