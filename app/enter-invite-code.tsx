import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { previewGuardianInvitation, type GuardianInvitePreview } from '@/services/guardianService';
import { useConnected } from '@/store/ConnectedContext';
import { formatDate } from '@/utils/format';

export default function EnterInviteCodeScreen() {
  const { respondToInvite } = useConnected();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<GuardianInvitePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const verify = async () => {
    setLoading(true); setError('');
    try { setPreview(await previewGuardianInvitation(code)); }
    catch (verifyError) { setPreview(null); setError(verifyError instanceof Error ? verifyError.message : 'The invite code could not be verified.'); }
    finally { setLoading(false); }
  };
  const respond = async (decision: 'accepted' | 'declined') => {
    setLoading(true); setError('');
    try { await respondToInvite(code, decision); router.replace('/people-i-protect'); }
    catch (responseError) { setError(responseError instanceof Error ? responseError.message : 'The invitation could not be updated.'); }
    finally { setLoading(false); }
  };
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.content}>
      <View><Text style={styles.title}>Link as a guardian</Text><Text style={styles.subtitle}>Enter the private invite code shared by the protected user.</Text></View>
      <Card style={styles.card}><Text style={styles.label}>Invite code</Text><TextInput accessibilityLabel="Invite code" value={code} onChangeText={(value) => { setCode(value.toUpperCase()); setPreview(null); }} autoCapitalize="characters" placeholder="CA-4821" placeholderTextColor={colors.textMuted} style={styles.input} maxLength={7} /><Button label="Verify invitation" loading={loading && !preview} onPress={verify} /></Card>
      {preview ? <Card><Text style={styles.requestLabel}>GUARDIAN REQUEST</Text><Text style={styles.name}>{preview.protectedUserName}</Text><Text style={styles.meta}>{preview.relationship || 'Trusted contact'} • invited {formatDate(preview.createdAt)}</Text><Text style={styles.explain}>Accepting lets you receive this person’s assigned SOS incidents and live location.</Text><View style={styles.actions}><Button label="Accept" loading={loading} onPress={() => void respond('accepted')} /><Button label="Decline" variant="secondary" disabled={loading} onPress={() => void respond('declined')} /></View></Card> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View></KeyboardAvoidingView></SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, flex: { flex: 1 }, content: { padding: spacing.lg, gap: 16 }, title: { color: colors.text, fontSize: 24, fontWeight: '800' }, subtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 5 }, card: { gap: 13 }, label: { color: colors.text, fontSize: 13, fontWeight: '700' }, input: { minHeight: 56, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.small, color: colors.text, backgroundColor: colors.surfaceElevated, paddingHorizontal: 14, fontSize: 20, fontWeight: '800', letterSpacing: 2, textAlign: 'center' }, requestLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 }, name: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 6 }, meta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 }, explain: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 14 }, actions: { gap: 8, marginTop: 16 }, error: { color: colors.redDark, backgroundColor: colors.redSoft, borderRadius: 10, padding: 11, fontSize: 12 },
});
