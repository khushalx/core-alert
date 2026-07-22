import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, EmptyState } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { previewGuardianInvitation, type GuardianInvitePreview } from '@/services/guardianService';
import { useConnected } from '@/store/ConnectedContext';
import type { GuardianRelationship } from '@/types/cloud';
import { formatDate } from '@/utils/format';

export default function GuardianRequestsScreen() {
  const { incomingRequests } = useConnected();
  return <SafeAreaView style={styles.screen} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>{incomingRequests.length === 0 ? <EmptyState icon="mail-open-outline" title="No pending requests" message="Guardian invitations addressed to your account will appear here." /> : incomingRequests.map((request) => <RequestCard key={request.id} request={request} />)}</ScrollView></SafeAreaView>;
}
function RequestCard({ request }: { request: GuardianRelationship }) {
  const { respondToInvite } = useConnected();
  const [preview, setPreview] = useState<GuardianInvitePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (request.invite_code) void previewGuardianInvitation(request.invite_code).then(setPreview).catch(() => undefined); }, [request.invite_code]);
  const respond = async (decision: 'accepted' | 'declined') => { if (!request.invite_code) return; setLoading(true); setError(''); try { await respondToInvite(request.invite_code, decision); } catch (responseError) { setError(responseError instanceof Error ? responseError.message : 'The request could not be updated.'); } finally { setLoading(false); } };
  return <Card><Text style={styles.eyebrow}>INVITED {formatDate(request.created_at).toUpperCase()}</Text><Text style={styles.name}>{preview?.protectedUserName ?? 'Core Alert user'}</Text><Text style={styles.relationship}>Relationship: {request.relationship || 'Trusted contact'}</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<View style={styles.actions}><Button label="Accept" loading={loading} onPress={() => void respond('accepted')} /><Button label="Decline" variant="secondary" disabled={loading} onPress={() => void respond('declined')} /></View></Card>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: 12 }, eyebrow: { color: colors.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 }, name: { color: colors.text, fontSize: 19, fontWeight: '800', marginTop: 6 }, relationship: { color: colors.textSecondary, fontSize: 12, marginTop: 4 }, actions: { gap: 8, marginTop: 16 }, error: { color: colors.redDark, fontSize: 11, marginTop: 10 } });
