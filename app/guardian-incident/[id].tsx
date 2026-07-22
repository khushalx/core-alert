import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MapCard } from '@/components/MapCard';
import { Button, Card, LoadingState, StatusBadge } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { getGuardianProfileSummary } from '@/services/guardianService';
import { acknowledgeIncident, distanceMeters, getIncidentById, getIncidentGuardians, getIncidentLocations } from '@/services/incidentService';
import { useApp } from '@/store/AppContext';
import { useAuth } from '@/store/AuthContext';
import { useConnected } from '@/store/ConnectedContext';
import type { ActiveGuardianAlert } from '@/types/cloud';
import { formatCoordinates, formatTime } from '@/utils/format';

export default function GuardianIncidentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { location } = useApp();
  const { guardianAlert, connection, respondToIncident } = useConnected();
  const [fallback, setFallback] = useState<ActiveGuardianAlert | null>(null);
  const [loading, setLoading] = useState(() => guardianAlert?.incident.id !== id);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const alert = guardianAlert?.incident.id === id ? guardianAlert : fallback;

  useEffect(() => {
    if (!id || !user || guardianAlert?.incident.id === id) return;
    let active = true;
    void (async () => {
      try {
        const incident = await getIncidentById(id);
        if (!incident) throw new Error('This SOS is no longer available.');
        const [assignments, locations, owner] = await Promise.all([getIncidentGuardians(id), getIncidentLocations(id), getGuardianProfileSummary(incident.user_id)]);
        let assignment = assignments.find((item) => item.guardian_user_id === user.id);
        if (!assignment) throw new Error('This SOS is not assigned to your account.');
        if (assignment.acknowledgement_status === 'not_acknowledged') assignment = await acknowledgeIncident(id, 'seen');
        if (active) setFallback({ incident, locations, owner, assignment });
      } catch (loadError) { if (active) setError(loadError instanceof Error ? loadError.message : 'The SOS could not be loaded.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [guardianAlert?.incident.id, id, user]);

  const currentCoordinates = useMemo(() => alert?.incident.last_latitude !== null && alert?.incident.last_longitude !== null && alert
    ? { latitude: alert.incident.last_latitude as number, longitude: alert.incident.last_longitude as number }
    : null, [alert]);
  const incidentCoordinates = useMemo(() => alert?.incident.incident_latitude !== null && alert?.incident.incident_longitude !== null && alert
    ? { latitude: alert.incident.incident_latitude as number, longitude: alert.incident.incident_longitude as number }
    : null, [alert]);
  const distance = useMemo(() => {
    if (!location.coordinates || !currentCoordinates) return null;
    return distanceMeters({ ...location.coordinates, accuracy: null }, { ...currentCoordinates, accuracy: null });
  }, [currentCoordinates, location.coordinates]);
  const respond = async (response: 'responding' | 'cannot_respond') => {
    if (!id) return; setActionLoading(true); setError('');
    try { await respondToIncident(id, response); }
    catch (responseError) { setError(responseError instanceof Error ? responseError.message : 'Your response could not be shared.'); }
    finally { setActionLoading(false); }
  };
  if (loading) return <SafeAreaView style={styles.screen}><LoadingState label="Opening secure SOS…" /></SafeAreaView>;
  if (!alert) return <SafeAreaView style={styles.missing}><Ionicons name="shield-outline" size={40} color={colors.textMuted} /><Text style={styles.title}>SOS unavailable</Text><Text style={styles.subtitle}>{error || 'This incident may have ended or is not assigned to your account.'}</Text></SafeAreaView>;
  const lastLocationAt = alert.locations.at(-1)?.recorded_at ?? alert.incident.updated_at;
  const active = alert.incident.status === 'active';
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}><View><Text style={styles.eyebrow}>{alert.incident.is_demo ? 'DEMO SOS' : 'CONNECTED PROTOTYPE'}</Text><Text style={styles.title}>{alert.owner?.full_name ?? 'Protected user'}</Text><Text style={styles.subtitle}>{active ? 'SOS active' : `SOS ${alert.incident.status}`}</Text></View><StatusBadge label={active ? 'Live' : 'Ended'} tone={active ? 'danger' : 'neutral'} /></View>
      <Card style={styles.statusCard}><StatusRow label="Started" value={formatTime(alert.incident.started_at)} /><StatusRow label="Connection" value={connection === 'connected' ? 'Live' : connection} /><StatusRow label="Last location" value={formatTime(lastLocationAt)} /><StatusRow label="Distance from you" value={distance === null ? 'Location unavailable' : distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`} /></Card>
      {active ? <Button label="I’m responding" icon="navigate-outline" loading={actionLoading} onPress={() => void respond('responding')} /> : null}
      <MapCard coordinates={currentCoordinates} incidentCoordinates={incidentCoordinates} height={230} label="Protected user’s live location" />
      <Card><Text style={styles.cardTitle}>Current location</Text><Text style={styles.coordinates}>{formatCoordinates(currentCoordinates)}</Text><Text style={styles.updated}>Updated {formatTime(lastLocationAt)} • {alert.locations.length} recorded points</Text></Card>
      <Card><Text style={styles.cardTitle}>Your response</Text><Text style={styles.response}>{ackLabel(alert.assignment.acknowledgement_status)}</Text>{active ? <Button label="I can’t respond" variant="secondary" disabled={actionLoading} onPress={() => void respond('cannot_respond')} style={styles.secondaryButton} /> : null}</Card>
      <View style={styles.secondaryActions}>
        <Button label="Call user" variant="secondary" icon="call-outline" disabled={!alert.owner?.phone} onPress={() => alert.owner?.phone && Linking.openURL(`tel:${alert.owner.phone}`)} />
        <Button label="Open in Maps" variant="secondary" icon="map-outline" disabled={!currentCoordinates} onPress={() => currentCoordinates && Linking.openURL(Platform.select({ ios: `maps:0,0?q=${currentCoordinates.latitude},${currentCoordinates.longitude}`, default: `https://www.google.com/maps/dir/?api=1&destination=${currentCoordinates.latitude},${currentCoordinates.longitude}` }))} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.disclaimer}>Emergency services were not contacted automatically by Core Alert.</Text>
    </ScrollView></SafeAreaView>
  );
}
function StatusRow({ label, value }: { label: string; value: string }) { return <View style={styles.statusRow}><Text style={styles.statusLabel}>{label}</Text><Text style={styles.statusValue}>{value}</Text></View>; }
function ackLabel(status: ActiveGuardianAlert['assignment']['acknowledgement_status']) { if (status === 'responding') return 'Responding'; if (status === 'cannot_respond') return 'Unable to respond'; if (status === 'seen') return 'Seen'; return 'Alert pending'; }
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: 14, paddingBottom: 34 }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { color: colors.redDark, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 }, title: { color: colors.text, fontSize: 24, fontWeight: '800', marginTop: 3 }, subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 3 }, statusCard: { paddingVertical: 7 }, statusRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }, statusLabel: { color: colors.textSecondary, fontSize: 12 }, statusValue: { color: colors.text, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' }, cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700' }, coordinates: { color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 10 }, updated: { color: colors.textSecondary, fontSize: 11, marginTop: 5 }, response: { color: colors.navy, fontSize: 18, fontWeight: '800', marginTop: 8 }, secondaryButton: { marginTop: 14 }, secondaryActions: { gap: 8 }, error: { color: colors.redDark, backgroundColor: colors.redSoft, borderRadius: 10, padding: 11, fontSize: 12 }, disclaimer: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center' }, missing: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24, gap: 8 },
});
