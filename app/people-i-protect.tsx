import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, EmptyState, StatusBadge } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { getGuardianProfileSummary } from '@/services/guardianService';
import { useConnected } from '@/store/ConnectedContext';
import type { GuardianProfileSummary, GuardianRelationship } from '@/types/cloud';
import { initials } from '@/utils/format';

export default function PeopleIProtectScreen() {
  const { peopleIProtect, guardianAlert } = useConnected();
  return <SafeAreaView style={styles.screen} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>{peopleIProtect.length === 0 ? <EmptyState icon="shield-outline" title="No linked protected users" message="Accept a guardian invitation to see the people who can assign you to an SOS." /> : peopleIProtect.map((relationship) => <ProtectedPersonCard key={relationship.id} relationship={relationship} activeIncidentId={guardianAlert?.incident.user_id === relationship.protected_user_id ? guardianAlert.incident.id : null} />)}</ScrollView></SafeAreaView>;
}
function ProtectedPersonCard({ relationship, activeIncidentId }: { relationship: GuardianRelationship; activeIncidentId: string | null }) {
  const [profile, setProfile] = useState<GuardianProfileSummary | null>(null);
  useEffect(() => { void getGuardianProfileSummary(relationship.protected_user_id).then(setProfile).catch(() => undefined); }, [relationship.protected_user_id]);
  return <Pressable accessibilityRole={activeIncidentId ? 'button' : undefined} disabled={!activeIncidentId} onPress={() => activeIncidentId && router.push({ pathname: '/guardian-incident/[id]', params: { id: activeIncidentId } })}><Card style={styles.card}><View style={styles.avatar}><Text style={styles.avatarText}>{initials(profile?.full_name ?? 'Core Alert')}</Text></View><View style={styles.copy}><Text style={styles.name}>{profile?.full_name ?? 'Loading protected user…'}</Text><Text style={styles.relationship}>{relationship.relationship || 'Trusted contact'}</Text></View><StatusBadge label={activeIncidentId ? 'SOS active' : 'Protected'} tone={activeIncidentId ? 'danger' : 'success'} /></Card></Pressable>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: 12 }, card: { flexDirection: 'row', alignItems: 'center', padding: 15 }, avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8EEF4', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.navy, fontSize: 12, fontWeight: '800' }, copy: { flex: 1, marginLeft: 11 }, name: { color: colors.text, fontSize: 15, fontWeight: '700' }, relationship: { color: colors.textSecondary, fontSize: 11, marginTop: 3 } });
