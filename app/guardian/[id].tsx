import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmationModal } from '@/components/ConfirmationModal';
import { Button, Card, StatusBadge } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { buildGuardianInviteMessage } from '@/services/guardianService';
import { useAuth } from '@/store/AuthContext';
import { useConnected } from '@/store/ConnectedContext';
import { formatDate, initials } from '@/utils/format';

export default function GuardianDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const { guardians, makePrimary, removeGuardian } = useConnected();
  const guardian = guardians.find((item) => item.id === id);
  const [loading, setLoading] = useState(false);
  const [removeVisible, setRemoveVisible] = useState(false);
  if (!guardian) return <SafeAreaView style={styles.missing}><Text style={styles.title}>Guardian not found</Text><Button label="Back" onPress={() => router.back()} /></SafeAreaView>;
  const share = () => Share.share({ message: buildGuardianInviteMessage(profile?.full_name ?? 'A Core Alert user', guardian) });
  const status = guardian.status === 'accepted' ? 'Ready' : guardian.status === 'declined' ? 'Declined' : guardian.guardian_email ? 'Invitation pending' : 'Not linked';
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}><View style={styles.avatar}><Text style={styles.avatarText}>{initials(guardian.guardian_name)}</Text></View><Text style={styles.title}>{guardian.guardian_name}</Text><Text style={styles.relationship}>{guardian.relationship || 'Trusted contact'}</Text><View style={styles.badges}><StatusBadge label={status} tone={guardian.status === 'accepted' ? 'success' : 'warning'} />{guardian.is_primary ? <StatusBadge label="Primary" tone="info" /> : null}<StatusBadge label={guardian.guardian_user_id ? 'Linked account' : 'Contact only'} tone="neutral" /></View></View>
      <Card><Detail label="Email" value={guardian.guardian_email || 'Not provided'} /><Detail label="Phone" value={guardian.guardian_phone || 'Not provided'} /><Detail label="Added" value={formatDate(guardian.created_at)} /><Detail label="Invite code" value={guardian.invite_code || 'Used or unavailable'} /></Card>
      {guardian.status === 'pending' && guardian.invite_code ? <Button label="Share invitation" icon="share-outline" variant="secondary" onPress={() => void share()} /> : null}
      {!guardian.is_primary && guardian.status !== 'removed' ? <Button label="Set as primary" variant="secondary" loading={loading} onPress={async () => { setLoading(true); try { await makePrimary(guardian.id); } finally { setLoading(false); } }} /> : null}
      <Button label="Remove guardian" variant="ghost" icon="trash-outline" onPress={() => setRemoveVisible(true)} />
      {guardian.status !== 'accepted' ? <View style={styles.note}><Ionicons name="information-circle-outline" size={18} color={colors.navy} /><Text style={styles.noteText}>{guardian.guardian_email ? 'This person will not receive in-app SOS alerts until they accept the invitation.' : 'Contact-only guardians are stored for reference. SMS is not connected in this phase.'}</Text></View> : null}
    </ScrollView>
    <ConfirmationModal visible={removeVisible} title={`Remove ${guardian.guardian_name}?`} message="They will no longer be assigned to new SOS incidents." confirmLabel="Remove" destructive onCancel={() => setRemoveVisible(false)} onConfirm={() => { setRemoveVisible(false); void removeGuardian(guardian.id).then(() => router.back()); }} />
    </SafeAreaView>
  );
}
function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>; }
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: 14, paddingBottom: 32 }, hero: { alignItems: 'center', paddingVertical: 12 }, avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#E8EEF4', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.navy, fontSize: 18, fontWeight: '800' }, title: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 12 }, relationship: { color: colors.textSecondary, fontSize: 13, marginTop: 3 }, badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10 }, detail: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }, detailLabel: { color: colors.textSecondary, fontSize: 11 }, detailValue: { color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 4 }, note: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#EEF4F8' }, noteText: { flex: 1, color: colors.textSecondary, fontSize: 11, lineHeight: 17 }, missing: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24, gap: 16 },
});
