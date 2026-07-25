import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

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
          <Summary value={active.length} label="Connected" icon="people" tone="success" />
          <Summary value={pending.length} label="Pending" icon="time" tone="warning" />
          <Summary value={primary ? '1' : '—'} label="Primary" icon="star" tone="info" />
        </View>

        {incomingRequests.length > 0 ? (
          <Card style={styles.requestCard}>
            <View style={styles.requestIcon}><Ionicons name="person-add-outline" size={21} color={colors.blueBright} /></View>
            <View style={styles.requestCopy}><Text style={styles.requestTitle}>Guardian requests</Text><Text style={styles.requestText}>{incomingRequests.length} invitation{incomingRequests.length === 1 ? '' : 's'} waiting</Text></View>
            <Button label="Review" variant="ghost" onPress={() => router.push('/guardian-requests')} />
          </Card>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label="Invite guardian" icon="person-add-outline" onPress={() => router.push('/guardian-form')} />
        <View style={styles.quickActions}>
          <QuickAction icon="key-outline" label="Enter invite" onPress={() => router.push('/enter-invite-code')} />
          <QuickAction icon="shield-outline" label="People I protect" onPress={() => router.push('/people-i-protect')} />
        </View>

        {guardians.length === 0 && !loading ? (
          <EmptyState icon="people-outline" title="No guardians yet" message="Invite a Core Alert account for live SOS updates, or save a contact-only guardian without claiming notification delivery." />
        ) : (
          <View><View style={styles.sectionRow}><Text style={styles.sectionLabel}>YOUR GUARDIANS</Text><StatusBadge label={`${guardians.length}`} tone="neutral" /></View>{guardians.map((guardian) => <GuardianCard key={guardian.id} guardian={guardian} onPress={() => router.push({ pathname: '/guardian/[id]', params: { id: guardian.id } })} />)}</View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Summary({ value, label, icon, tone }: { value: number | string; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; tone: 'success' | 'warning' | 'info' }) {
  const color = tone === 'success' ? colors.green : tone === 'warning' ? colors.amber : colors.blueBright;
  return <Card style={styles.summary}><Ionicons name={icon} size={17} color={color} /><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></Card>;
}
function QuickAction({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.quickPressed]}><View style={styles.quickIcon}><Ionicons name={icon} size={19} color={colors.blueBright} /></View><Text style={styles.quickLabel}>{label}</Text><Ionicons name="chevron-forward" size={16} color={colors.textMuted} /></Pressable>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: 34, gap: 16 },
  summaryGrid: { flexDirection: 'row', gap: 8 },
  summary: { flex: 1, minHeight: 104, padding: 12, alignItems: 'center', justifyContent: 'center' },
  summaryValue: { color: colors.text, fontSize: 23, fontWeight: '800', marginTop: 4 },
  summaryLabel: { color: colors.textSecondary, fontSize: 9, marginTop: 1 },
  requestCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderColor: colors.navySoft },
  requestIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueSoft },
  requestCopy: { flex: 1, marginLeft: 10 },
  requestTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  requestText: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  quickActions: { flexDirection: 'row', gap: 10 },
  quickAction: { flex: 1, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, backgroundColor: colors.surface, borderRadius: 15, borderWidth: 1, borderColor: colors.border },
  quickPressed: { backgroundColor: colors.surfacePressed, transform: [{ scale: 0.98 }] },
  quickIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { color: colors.text, fontSize: 11, lineHeight: 15, fontWeight: '700', flex: 1 },
  error: { color: colors.amber, backgroundColor: colors.amberSoft, borderRadius: 10, padding: 11, fontSize: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  sectionLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
});
