import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GuardianCard } from '@/components/GuardianCard';
import { AppHeader, Button, Card, EmptyState, Screen, StatusBadge } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useConnected } from '@/store/ConnectedContext';

export default function GuardiansScreen() {
  const { guardians, incomingRequests, loading, refreshing, refresh, error } = useConnected();
  const active = guardians.filter((item) => item.status === 'accepted');
  const pending = guardians.filter((item) => item.status === 'pending');
  const primary = guardians.find((item) => item.is_primary && item.status !== 'removed');
  return (
    <Screen>
      <AppHeader title="Guardians" subtitle="Connected safety circle" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
        <View style={styles.summaryGrid}>
          <Summary value={active.length} label="Active" />
          <Summary value={pending.length} label="Pending" />
          <Summary value={primary ? '1' : '—'} label="Primary" />
        </View>

        {incomingRequests.length > 0 ? (
          <Card style={styles.requestCard}>
            <View style={styles.requestIcon}><Ionicons name="person-add-outline" size={21} color={colors.navy} /></View>
            <View style={styles.requestCopy}><Text style={styles.requestTitle}>Guardian requests</Text><Text style={styles.requestText}>{incomingRequests.length} invitation{incomingRequests.length === 1 ? '' : 's'} waiting</Text></View>
            <Button label="Review" variant="ghost" onPress={() => router.push('/guardian-requests')} />
          </Card>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}><Button label="Add guardian" icon="person-add-outline" onPress={() => router.push('/guardian-form')} /><Button label="Enter invite code" variant="secondary" icon="key-outline" onPress={() => router.push('/enter-invite-code')} /></View>

        {guardians.length === 0 && !loading ? (
          <EmptyState icon="people-outline" title="No guardians yet" message="Invite a Core Alert account for live SOS updates, or save a contact-only guardian without claiming notification delivery." />
        ) : (
          <View><View style={styles.sectionRow}><Text style={styles.sectionLabel}>YOUR GUARDIANS</Text><StatusBadge label={`${guardians.length}`} tone="neutral" /></View>{guardians.map((guardian) => <GuardianCard key={guardian.id} guardian={guardian} onPress={() => router.push({ pathname: '/guardian/[id]', params: { id: guardian.id } })} />)}</View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Summary({ value, label }: { value: number | string; label: string }) { return <Card style={styles.summary}><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></Card>; }
const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: 32, gap: 16 }, summaryGrid: { flexDirection: 'row', gap: 8 }, summary: { flex: 1, padding: 13, alignItems: 'center' }, summaryValue: { color: colors.text, fontSize: 22, fontWeight: '800' }, summaryLabel: { color: colors.textSecondary, fontSize: 10, marginTop: 3 },
  requestCard: { flexDirection: 'row', alignItems: 'center', padding: 12 }, requestIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8EEF4' }, requestCopy: { flex: 1, marginLeft: 10 }, requestTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, requestText: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  actions: { gap: 9 }, error: { color: '#B54708', backgroundColor: colors.amberSoft, borderRadius: 10, padding: 11, fontSize: 12 }, sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }, sectionLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
});
