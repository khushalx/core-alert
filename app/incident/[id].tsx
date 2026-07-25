import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IncidentTimeline } from '@/components/IncidentTimeline';
import { MapCard } from '@/components/MapCard';
import { Button, Card, LoadingState, StatusBadge } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import {
  createIncidentEvidenceUrl,
  getIncidentById,
  getIncidentEvidence,
  getIncidentEscalationEvents,
  getIncidentGuardians,
  getIncidentLocations,
  getIncidentRecipients,
  subscribeToIncidentEvidence,
} from '@/services/incidentService';
import { useConnected } from '@/store/ConnectedContext';
import type {
  CloudIncident,
  IncidentEscalationEvent,
  IncidentEvidence,
  IncidentGuardian,
  IncidentLocation,
  IncidentRecipient,
} from '@/types/cloud';
import { formatCoordinates, formatDate, formatTime, initials } from '@/utils/format';

export default function IncidentDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { guardians } = useConnected();
  const [incident, setIncident] = useState<CloudIncident | null>(null);
  const [locations, setLocations] = useState<IncidentLocation[]>([]);
  const [assignments, setAssignments] = useState<IncidentGuardian[]>([]);
  const [recipients, setRecipients] = useState<IncidentRecipient[]>([]);
  const [events, setEvents] = useState<IncidentEscalationEvent[]>([]);
  const [evidence, setEvidence] = useState<IncidentEvidence[]>([]);
  const [openingEvidenceId, setOpeningEvidenceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    let active = true;
    void Promise.all([
      getIncidentById(id),
      getIncidentLocations(id),
      getIncidentGuardians(id),
      getIncidentRecipients(id),
      getIncidentEscalationEvents(id),
      getIncidentEvidence(id),
    ]).then(([nextIncident, nextLocations, nextAssignments, nextRecipients, nextEvents, nextEvidence]) => {
      if (!active) return;
      setIncident(nextIncident);
      setLocations(nextLocations);
      setAssignments(nextAssignments);
      setRecipients(nextRecipients);
      setEvents(nextEvents);
      setEvidence(nextEvidence);
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'The incident could not be loaded.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    const refreshEvidence = () => {
      void getIncidentEvidence(id).then((nextEvidence) => {
        if (active) setEvidence(nextEvidence);
      }).catch(() => {
        // The initial loader and explicit Open action surface useful errors.
        // A transient Realtime refresh failure should remain non-disruptive.
      });
    };
    const unsubscribe = subscribeToIncidentEvidence(id, refreshEvidence);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [id]);

  const points = useMemo(() => locations.map((point) => ({ latitude: point.latitude, longitude: point.longitude })), [locations]);
  if (loading) return <SafeAreaView style={styles.screen}><LoadingState label="Loading secure incident history…" /></SafeAreaView>;
  if (!incident) return <MissingIncident error={error} />;

  const initial = incident.incident_latitude !== null && incident.incident_longitude !== null
    ? { latitude: incident.incident_latitude, longitude: incident.incident_longitude }
    : null;
  const latest = incident.last_latitude !== null && incident.last_longitude !== null
    ? { latitude: incident.last_latitude, longitude: incident.last_longitude }
    : null;
  const acknowledged = assignments.filter((item) => item.acknowledgement_status !== 'not_acknowledged').length;
  const openEvidence = async (item: IncidentEvidence) => {
    setOpeningEvidenceId(item.id);
    try {
      const url = await createIncidentEvidenceUrl(item);
      await Linking.openURL(url);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Evidence could not be opened.');
    } finally {
      setOpeningEvidenceId(null);
    }
  };
  const timeline = [
    'SOS incident created in Supabase',
    initial ? 'Original incident location captured' : 'Original location unavailable',
    `${recipients.length} guardian recipients prepared`,
    ...events.map((event) => event.message),
    `${locations.length} location updates stored`,
    incident.status === 'active' ? 'SOS remains active' : `SOS marked ${incident.status}`,
  ];

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryHeader}>
          <View><Text style={styles.eyebrow}>{formatDate(incident.started_at).toUpperCase()}</Text><Text style={styles.title}>SOS {incident.status.replace('_', ' ')}</Text></View>
          <StatusBadge label={incident.is_demo ? 'Demo SOS' : 'Prototype SOS'} tone={incident.is_demo ? 'neutral' : 'danger'} />
        </View>
        <MapCard coordinates={latest} incidentCoordinates={initial} path={points} height={230} label="Recorded incident path" />

        <Card>
          <Text style={styles.cardTitle}>Incident summary</Text>
          <View style={styles.summaryGrid}>
            <SummaryItem label="Started" value={formatTime(incident.started_at)} />
            <SummaryItem label="Ended" value={incident.ended_at ? formatTime(incident.ended_at) : 'Active'} />
            <SummaryItem label="Duration" value={duration(incident)} />
            <SummaryItem label="Acknowledged" value={`${acknowledged} of ${assignments.length}`} />
            <SummaryItem label="Activation" value={sourceLabel(incident.activation_source)} />
            <SummaryItem label="Mode" value={incident.is_demo ? 'Demo' : 'Normal prototype'} />
          </View>
          <View style={styles.coordinateBlock}><Text style={styles.coordinateLabel}>ORIGINAL → FINAL LOCATION</Text><Text style={styles.coordinateValue}>{formatCoordinates(initial)} → {formatCoordinates(latest)}</Text></View>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Guardian delivery</Text>
          {recipients.length === 0 ? <Text style={styles.emptyText}>No guardian delivery records were created.</Text> : recipients.map((recipient) => (
            <View key={recipient.id} style={styles.guardianRow}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{initials(recipient.guardian_name)}</Text></View>
              <View style={styles.guardianCopy}>
                <View style={styles.guardianNameRow}><Text style={styles.guardianName}>{recipient.guardian_name}</Text>{recipient.is_primary ? <StatusBadge label="Primary" tone="info" /> : null}</View>
                <Text style={styles.guardianStatus}>Push: {deliveryChannelLabel(recipient.push_status)} • SMS: {deliveryChannelLabel(recipient.sms_status)}</Text>
                <Text style={styles.guardianStatus}>Escalation: {deliveryChannelLabel(recipient.escalation_status)}</Text>
              </View>
            </View>
          ))}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Guardian acknowledgements</Text>
          {assignments.length === 0 ? <Text style={styles.emptyText}>No linked guardians were assigned.</Text> : assignments.map((assignment) => {
            const guardian = guardians.find((item) => item.guardian_user_id === assignment.guardian_user_id);
            const name = guardian?.guardian_name ?? 'Linked guardian';
            return <View key={assignment.id} style={styles.guardianRow}><View style={styles.avatar}><Text style={styles.avatarText}>{initials(name)}</Text></View><View style={styles.guardianCopy}><Text style={styles.guardianName}>{name}</Text><Text style={styles.guardianStatus}>{ackLabel(assignment.acknowledgement_status)} • {deliveryChannelLabel(assignment.delivery_status)}</Text></View></View>;
          })}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Emergency evidence</Text>
          <Text style={styles.evidenceNote}>Private recordings are available only to the protected user and guardians assigned to this incident. Links expire after five minutes.</Text>
          {evidence.length === 0 ? <Text style={styles.emptyText}>No uploaded evidence is available for this incident.</Text> : evidence.map((item, index) => (
            <View key={item.id} style={styles.evidenceRow}>
              <View style={styles.evidenceIcon}><Ionicons name={item.media_type === 'video' ? 'videocam' : 'mic'} size={19} color={colors.redDark} /></View>
              <View style={styles.evidenceCopy}>
                <View style={styles.evidenceTitleRow}><Text style={styles.guardianName}>{item.media_type === 'video' ? 'Video with audio' : 'Audio recording'} {evidence.length > 1 ? `${index + 1}` : ''}</Text><StatusBadge label="Secured" tone="success" /></View>
                <View style={styles.miniWave}>{[6, 12, 8, 15, 10, 13, 7].map((height, bar) => <View key={`${item.id}-${bar}`} style={[styles.miniWaveBar, { height }]} />)}</View>
                <Text style={styles.guardianStatus}>{formatTime(item.captured_at)} • {formatEvidenceDuration(item.duration_ms)} • {formatEvidenceSize(item.byte_size)}</Text>
              </View>
              <Button
                label="Open"
                variant="secondary"
                loading={openingEvidenceId === item.id}
                onPress={() => void openEvidence(item)}
              />
            </View>
          ))}
          {error ? <Text style={styles.evidenceError}>{error}</Text> : null}
        </Card>

        <Card><Text style={styles.cardTitle}>Incident timeline</Text><View style={styles.timeline}><IncidentTimeline items={timeline} active={incident.status === 'active'} /></View></Card>
        {incident.is_demo ? <Button label="Open responder simulation" variant="secondary" icon="desktop-outline" onPress={() => router.push({ pathname: '/responder-simulation/[id]', params: { id: incident.id } })} /> : null}
        <Text style={styles.disclaimer}>Emergency services were not contacted automatically. A dialer handoff does not confirm that a call was placed or answered.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function MissingIncident({ error }: { error: string }) {
  return <SafeAreaView style={styles.missing}><Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} /><Text style={styles.missingTitle}>Incident unavailable</Text><Text style={styles.missingText}>{error || 'This incident may not belong to your account.'}</Text><Button label="Back to Activity" onPress={() => router.back()} /></SafeAreaView>;
}
function SummaryItem({ label, value }: { label: string; value: string }) { return <View style={styles.summaryItem}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>; }
function duration(incident: CloudIncident) { const end = incident.ended_at ? new Date(incident.ended_at).getTime() : Date.now(); const seconds = Math.max(0, Math.round((end - new Date(incident.started_at).getTime()) / 1000)); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }
function sourceLabel(source: string) { if (source === 'volume-shortcut') return 'Volume shortcut'; if (source === 'developer-simulation') return 'Developer simulation'; return 'Manual SOS'; }
function ackLabel(status: IncidentGuardian['acknowledgement_status']) { if (status === 'responding') return 'Responding'; if (status === 'cannot_respond') return 'Unable to respond'; if (status === 'seen') return 'Seen'; return 'Alert pending'; }
function deliveryChannelLabel(status: string) {
  if (status === 'delivered') return 'provider accepted';
  if (status === 'sent') return 'provider accepted';
  return status.replaceAll('_', ' ');
}
function formatEvidenceDuration(milliseconds: number) {
  const seconds = Math.max(1, Math.round(milliseconds / 1_000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
function formatEvidenceSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, content: { padding: spacing.lg, gap: 14, paddingBottom: 32 }, summaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, eyebrow: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', letterSpacing: 0.7 }, title: { color: colors.text, fontSize: 21, fontWeight: '800', textTransform: 'capitalize', marginTop: 3 }, cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' }, summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }, summaryItem: { width: '50%', paddingVertical: 9 }, summaryLabel: { color: colors.textSecondary, fontSize: 11 }, summaryValue: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 3 }, coordinateBlock: { marginTop: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border }, coordinateLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 }, coordinateValue: { color: colors.text, fontSize: 12, fontWeight: '600', marginTop: 5 }, guardianRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }, avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: colors.blueBright, fontSize: 11, fontWeight: '800' }, guardianCopy: { flex: 1, marginLeft: 10 }, guardianNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, guardianName: { color: colors.text, fontSize: 13, fontWeight: '700' }, guardianStatus: { color: colors.textSecondary, fontSize: 10, marginTop: 3, textTransform: 'capitalize' }, emptyText: { color: colors.textSecondary, fontSize: 12, marginTop: 12 }, evidenceNote: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 6 }, evidenceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }, evidenceIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.redSoft, alignItems: 'center', justifyContent: 'center' }, evidenceCopy: { flex: 1 }, evidenceTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }, miniWave: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 17, marginTop: 5 }, miniWaveBar: { width: 2, borderRadius: 1, backgroundColor: colors.red }, evidenceError: { color: colors.redDark, fontSize: 11, marginTop: 10 }, timeline: { marginTop: 16 }, disclaimer: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: 'center' }, missing: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: 24, gap: 10 }, missingTitle: { color: colors.text, fontSize: 19, fontWeight: '800' }, missingText: { color: colors.textSecondary, fontSize: 13, marginBottom: 10, textAlign: 'center' },
});
