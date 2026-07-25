import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IncidentTimeline } from '@/components/IncidentTimeline';
import { MapCard } from '@/components/MapCard';
import { Button, Card, LoadingState, StatusBadge } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { getIncidentById, getIncidentEscalationEvents, recordResponderSimulation } from '@/services/incidentService';
import type { CloudIncident, IncidentEscalationEvent } from '@/types/cloud';
import { formatTime } from '@/utils/format';

const steps = ['received', 'reviewing', 'dispatched_simulation', 'closed'] as const;
type SimulationStep = typeof steps[number];

export default function ResponderSimulationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [incident, setIncident] = useState<CloudIncident | null>(null);
  const [events, setEvents] = useState<IncidentEscalationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const [nextIncident, nextEvents] = await Promise.all([getIncidentById(id), getIncidentEscalationEvents(id)]);
    setIncident(nextIncident);
    setEvents(nextEvents.filter((event) => event.kind === 'responder_simulation'));
  }, [id]);

  useEffect(() => {
    let active = true;
    if (!id) return () => { active = false; };
    void Promise.all([getIncidentById(id), getIncidentEscalationEvents(id)]).then(([nextIncident, nextEvents]) => {
      if (!active) return;
      setIncident(nextIncident);
      setEvents(nextEvents.filter((event) => event.kind === 'responder_simulation'));
    }).catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : 'The simulation could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const currentIndex = Math.min(events.length - 1, steps.length - 1);
  const nextStep: SimulationStep | null = steps[Math.min(currentIndex + 1, steps.length - 1)] ?? null;
  const complete = currentIndex >= steps.length - 1;
  const coordinates = useMemo(() => incident?.last_latitude !== null && incident?.last_longitude !== null && incident
    ? { latitude: incident.last_latitude as number, longitude: incident.last_longitude as number }
    : null, [incident]);

  const advance = async () => {
    if (!id || !nextStep || complete) return;
    setSaving(true); setError('');
    try { await recordResponderSimulation(id, nextStep); await load(); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'The simulated status could not be saved.'); }
    finally { setSaving(false); }
  };

  if (loading) return <SafeAreaView style={styles.screen}><LoadingState label="Loading responder simulation…" /></SafeAreaView>;
  if (!incident || !incident.is_demo) return <SafeAreaView style={styles.missing}><Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} /><Text style={styles.title}>Demo incident required</Text><Text style={styles.copy}>{error || 'The responder dashboard can only be used with a clearly labelled Demo SOS.'}</Text><Button label="Go back" onPress={() => router.back()} /></SafeAreaView>;

  const timeline = events.length > 0
    ? events.map((event) => event.message)
    : ['Waiting for you to begin the hackathon responder simulation.'];

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.banner}>
          <Ionicons name="flask-outline" size={24} color={colors.white} />
          <View style={styles.bannerCopy}>
            <Text style={styles.bannerEyebrow}>HACKATHON SIMULATION</Text>
            <Text style={styles.bannerTitle}>Responder console</Text>
          </View>
          <StatusBadge label="Not live" tone="neutral" />
        </View>

        <Card>
          <Text style={styles.warningTitle}>No police connection</Text>
          <Text style={styles.copy}>These controls create demonstration timeline events only. They do not notify, dispatch, or represent any government or emergency-service agency.</Text>
        </Card>

        <MapCard coordinates={coordinates} height={220} label="Demo incident location" />

        <Card>
          <Text style={styles.cardTitle}>Simulation status</Text>
          <View style={styles.dataRow}><Text style={styles.dataLabel}>Incident began</Text><Text style={styles.dataValue}>{formatTime(incident.started_at)}</Text></View>
          <View style={styles.dataRow}><Text style={styles.dataLabel}>Current step</Text><Text style={styles.dataValue}>{events.length === 0 ? 'Not started' : simulationLabel(steps[currentIndex])}</Text></View>
          <View style={styles.timeline}><IncidentTimeline items={timeline} active={!complete} /></View>
        </Card>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!complete ? <Button label={events.length === 0 ? 'Begin simulation' : `Advance to ${simulationLabel(nextStep!)}`} icon="play-outline" loading={saving} onPress={() => void advance()} /> : <Button label="Simulation complete" icon="checkmark-circle-outline" disabled />}
        <Button label="Return to active SOS" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </SafeAreaView>
  );
}

function simulationLabel(step: SimulationStep): string {
  if (step === 'received') return 'Alert received';
  if (step === 'reviewing') return 'Reviewing location';
  if (step === 'dispatched_simulation') return 'Dispatch simulated';
  return 'Simulation closed';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: 14, paddingBottom: 34 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: colors.navy },
  bannerCopy: { flex: 1 },
  bannerEyebrow: { color: '#B9D4E8', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  bannerTitle: { color: colors.white, fontSize: 20, fontWeight: '800', marginTop: 3 },
  warningTitle: { color: colors.redDark, fontSize: 15, fontWeight: '800' },
  copy: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  dataLabel: { color: colors.textSecondary, fontSize: 12 },
  dataValue: { color: colors.text, fontSize: 12, fontWeight: '700' },
  timeline: { marginTop: 16 },
  error: { color: colors.redDark, backgroundColor: colors.redSoft, borderRadius: 10, padding: 11, fontSize: 12 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: colors.background },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
});
