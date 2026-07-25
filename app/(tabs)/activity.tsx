import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader, Card, EmptyState, LoadingState, Screen, StatusBadge } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { getIncidentGuardians } from '@/services/incidentService';
import { useConnected } from '@/store/ConnectedContext';
import type { CloudIncident } from '@/types/cloud';
import { formatDate, formatTime } from '@/utils/format';

type Filter = 'All' | 'Alerts' | 'Demo';
export default function ActivityScreen() {
  const { incidents, loading, refreshing, refresh, error } = useConnected();
  const [filter, setFilter] = useState<Filter>('All');
  const filtered = useMemo(() => incidents.filter((incident) => filter === 'All' || (filter === 'Demo' ? incident.is_demo : !incident.is_demo)), [filter, incidents]);
  const grouped = useMemo(() => filtered.reduce<Record<string, CloudIncident[]>>((groups, incident) => { const key = formatDate(incident.started_at); groups[key] = [...(groups[key] ?? []), incident]; return groups; }, {}), [filtered]);
  return <Screen><AppHeader title="Activity" subtitle="Cloud incident history" /><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
    <View style={styles.filters}>{(['All', 'Alerts', 'Demo'] as const).map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: filter === item }} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.filterActive]}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text></Pressable>)}</View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {loading && incidents.length === 0 ? <LoadingState label="Loading cloud history…" /> : filtered.length === 0 ? <EmptyState icon="time-outline" title="No cloud incidents" message="Completed, cancelled, and active SOS incidents will appear here after they are stored in Supabase." /> : Object.entries(grouped).map(([date, dateIncidents]) => <View key={date}><Text style={styles.dateLabel}>{date.toUpperCase()}</Text><Card style={styles.groupCard}>{dateIncidents.map((incident, index) => <IncidentRow key={incident.id} incident={incident} last={index === dateIncidents.length - 1} />)}</Card></View>)}
  </ScrollView></Screen>;
}
function IncidentRow({ incident, last }: { incident: CloudIncident; last: boolean }) {
  const [ackCount, setAckCount] = useState<number | null>(null);
  useEffect(() => { let active = true; void getIncidentGuardians(incident.id).then((items) => { if (active) setAckCount(items.filter((item) => item.acknowledgement_status !== 'not_acknowledged').length); }).catch(() => { if (active) setAckCount(null); }); return () => { active = false; }; }, [incident.id]);
  const duration = formatCloudDuration(incident);
  const accent = incident.status === 'active' ? colors.red : incident.status === 'resolved' ? colors.green : colors.blueBright;
  return <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/incident/[id]', params: { id: incident.id } })} style={({ pressed }) => [styles.incident, !last && styles.incidentBorder, pressed && styles.pressed]}>
    <View style={[styles.accent, { backgroundColor: accent }]} />
    <View style={[styles.incidentIcon, incident.status === 'cancelled' && styles.cancelledIcon]}><Ionicons name={incident.status === 'active' ? 'radio-outline' : incident.status === 'resolved' ? 'shield-checkmark-outline' : 'close-outline'} size={21} color={accent} /></View>
    <View style={styles.incidentCopy}><View style={styles.titleRow}><Text style={styles.incidentTitle}>SOS {incident.status.replace('_', ' ')}</Text><StatusBadge label={incident.is_demo ? 'Demo' : 'Alert'} tone={incident.is_demo ? 'info' : 'danger'} /></View><Text style={styles.meta}>{formatTime(incident.started_at)} • {duration} • {ackCount === null ? '—' : ackCount} acknowledgements</Text><Text style={styles.source}>{sourceLabel(incident.activation_source)}</Text></View><Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
  </Pressable>;
}
function formatCloudDuration(incident: CloudIncident) { if (!incident.ended_at) return 'Active'; const seconds = Math.max(0, Math.round((new Date(incident.ended_at).getTime() - new Date(incident.started_at).getTime()) / 1000)); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }
function sourceLabel(source: string) { if (source === 'volume-shortcut') return 'Volume-down shortcut'; if (source === 'developer-simulation') return 'Developer simulation'; return 'Manual SOS'; }
const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: 34, gap: 18 },
  filters: { flexDirection: 'row', padding: 4, borderRadius: 15, backgroundColor: colors.surface },
  filter: { flex: 1, minHeight: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  filterActive: { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.borderStrong },
  filterText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: colors.redDark },
  error: { color: colors.amber, backgroundColor: colors.amberSoft, borderRadius: 10, padding: 11, fontSize: 12 },
  dateLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 9 },
  groupCard: { paddingVertical: 2, paddingHorizontal: 14 },
  incident: { flexDirection: 'row', alignItems: 'center', minHeight: 96, paddingVertical: 14, overflow: 'hidden' },
  accent: { width: 3, height: 38, borderRadius: 2, marginRight: 10 },
  incidentBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  pressed: { opacity: 0.62 },
  incidentIcon: { width: 42, height: 42, borderRadius: radii.small, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  cancelledIcon: { backgroundColor: colors.backgroundSecondary },
  incidentCopy: { flex: 1, marginHorizontal: 11 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  incidentTitle: { color: colors.text, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' },
  meta: { color: colors.textSecondary, fontSize: 10, marginTop: 7 },
  source: { color: colors.textMuted, fontSize: 10, marginTop: 4 },
});
