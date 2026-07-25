import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmationModal } from '@/components/ConfirmationModal';
import { IncidentTimeline } from '@/components/IncidentTimeline';
import { MapCard } from '@/components/MapCard';
import { Button, Card, StatusBadge } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { useHardwareTrigger } from '@/hooks/useHardwareTrigger';
import { DEFAULT_EMERGENCY_NUMBER, openEmergencyDialer } from '@/services/emergencyCallService';
import { stopNativeEvidenceCapture } from '@/services/hardwareTriggerAdapter';
import { hardwareTriggerService } from '@/services/hardwareTriggerService';
import { useApp } from '@/store/AppContext';
import { useConnected } from '@/store/ConnectedContext';
import { formatCoordinates, formatElapsedTime, formatTime } from '@/utils/format';

export function SosOverlay() {
  const { state } = useApp();
  return (
    <Modal
      visible={state.sosState.stage !== 'idle'}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={() => undefined}>
      {state.sosState.stage === 'countdown' || state.sosState.stage === 'activating'
        ? <CountdownStage />
        : null}
      {state.sosState.stage === 'active' ||
      state.sosState.stage === 'ending' ||
      state.sosState.stage === 'ending_failed'
        ? <ActiveStage />
        : null}
    </Modal>
  );
}

function CountdownStage() {
  const { state, activateSosTest, cancelSosTest } = useApp();
  const countdownState = state.sosState.stage === 'countdown' ? state.sosState : null;
  const activating = state.sosState.stage === 'activating';
  const [remaining, setRemaining] = useState(() => countdownState?.duration ?? 0);
  const [pulse] = useState(() => new Animated.Value(0));
  const lastHapticSecond = useRef<number | null>(null);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  useEffect(() => {
    if (!countdownState) return;
    const update = () => {
      const elapsed = (Date.now() - new Date(countdownState.startedAt).getTime()) / 1000;
      const next = Math.max(0, Math.ceil(countdownState.duration - elapsed));
      setRemaining(next);
      if (
        state.preferences.hapticsEnabled &&
        next > 0 &&
        next <= 3 &&
        lastHapticSecond.current !== next
      ) {
        lastHapticSecond.current = next;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
      }
      if (next === 0) void activateSosTest();
    };
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [activateSosTest, countdownState, state.preferences.hapticsEnabled]);

  const outerScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.25] });
  const outerOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0] });
  const innerScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.08] });

  return (
    <SafeAreaView style={styles.countdownScreen}>
      <View style={styles.demoBadge}>
        <Ionicons name={state.preferences.demoModeEnabled ? 'flask-outline' : 'shield-outline'} size={15} color={colors.redDark} />
        <Text style={styles.demoBadgeText}>{state.preferences.demoModeEnabled ? 'DEMO SOS' : 'CONNECTED PROTOTYPE'}</Text>
      </View>
      <View style={styles.countdownContent}>
        <View style={styles.pulseArea}>
          <Animated.View
            style={[
              styles.outerRing,
              { opacity: outerOpacity, transform: [{ scale: outerScale }] },
            ]}
          />
          <Animated.View style={[styles.innerRing, { transform: [{ scale: innerScale }] }]}>
            {activating ? (
              <Ionicons name="checkmark" size={72} color={colors.white} accessibilityLabel="SOS activated" />
            ) : (
              <>
                <Text accessibilityLiveRegion="assertive" style={styles.countdownNumber}>{remaining}</Text>
                <Text style={styles.secondsLabel}>seconds</Text>
              </>
            )}
          </Animated.View>
        </View>
        <Text accessibilityLiveRegion="assertive" style={styles.countdownTitle}>
          {activating ? 'SOS activated' : 'SOS activating'}
        </Text>
        <Text style={styles.countdownMessage}>
          {activating
            ? 'Alerting your guardians and starting live protection.'
            : 'Configured guardians will be alerted through available provider channels when the countdown ends.'}
        </Text>
      </View>
      <View style={styles.countdownFooter}>
        {!activating
          ? <Button label="Cancel SOS" variant="secondary" icon="close" onPress={cancelSosTest} />
          : null}
        <Text style={styles.demoNote}>Emergency services are not contacted automatically.</Text>
      </View>
    </SafeAreaView>
  );
}

function ActiveStage() {
  const { state, location, endSosTest, showToast } = useApp();
  const { connection, guardians, incidentGuardians, incidentRecipients, incidentEvents } = useConnected();
  const hardware = useHardwareTrigger();
  const [endVisible, setEndVisible] = useState(false);
  const [callVisible, setCallVisible] = useState(false);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [ending, setEnding] = useState(false);
  const [callLoading, setCallLoading] = useState(false);
  const [acknowledgement] = useState(() => new Animated.Value(0));
  const [alertPulse] = useState(() => new Animated.Value(0));
  const activeState =
    state.sosState.stage === 'active' ||
    state.sosState.stage === 'ending' ||
    state.sosState.stage === 'ending_failed'
      ? state.sosState
      : null;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    Animated.timing(acknowledgement, {
      toValue: 1,
      duration: 550,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [acknowledgement]);

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(alertPulse, { toValue: 1, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(alertPulse, { toValue: 0, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    animation.start();
    void hardwareTriggerService.refreshNativeDiagnostics();
    const diagnosticsTimer = setInterval(() => void hardwareTriggerService.refreshNativeDiagnostics(), 750);
    return () => {
      animation.stop();
      clearInterval(diagnosticsTimer);
    };
  }, [alertPulse]);

  const elapsed = useMemo(() => {
    if (!activeState) return '0:00';
    const seconds = Math.max(0, Math.floor(((now ?? new Date(activeState.startedAt).getTime()) - new Date(activeState.startedAt).getTime()) / 1000));
    return formatElapsedTime(seconds);
  }, [activeState, now]);

  if (!activeState) return null;
  const assignedCount = incidentGuardians.length;
  const acceptedCount = incidentGuardians.filter((item) => item.delivery_status === 'delivered').length;
  const acknowledged = incidentGuardians.filter((item) => item.acknowledgement_status === 'responding' || item.acknowledgement_status === 'cannot_respond').length;
  const smsSent = incidentRecipients.filter((item) => item.sms_status === 'sent').length;
  const escalation = incidentEvents.find((item) => item.kind === 'guardian_timeout');
  const respondingNames = incidentGuardians
    .filter((item) => item.acknowledgement_status === 'responding')
    .map((item) => guardians.find((guardian) => guardian.guardian_user_id === item.guardian_user_id)?.guardian_name)
    .filter((name): name is string => Boolean(name));
  const guardianStatusText = activeState.guardianStatus === 'assigning'
    ? 'Preparing linked guardians'
    : activeState.guardianStatus === 'alerting'
      ? `Alerting ${assignedCount} linked guardian${assignedCount === 1 ? '' : 's'}`
      : activeState.guardianStatus === 'none'
        ? 'No linked guardian is assigned'
        : activeState.guardianStatus === 'failed'
          ? `${acceptedCount} accepted • delivery needs attention`
          : `${assignedCount} assigned • ${acceptedCount} push/SMS accepted • ${acknowledged} replied`;

  return (
    <SafeAreaView style={styles.activeScreen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.activeContent} showsVerticalScrollIndicator={false}>
        <View style={styles.activeHeader}>
          <View style={styles.liveDot} />
          <View style={styles.activeHeaderCopy}>
            <Text style={styles.activeEyebrow}>{activeState.isDemo ? 'DEMO SOS' : 'CONNECTED PROTOTYPE'}</Text>
            <Text style={styles.activeTitle}>SOS active</Text>
          </View>
          <Text style={styles.elapsed}>{elapsed}</Text>
        </View>

        <View style={styles.alertHero}>
          <View style={styles.alertEffect}>
            <Animated.View style={[styles.alertPulseRing, {
              opacity: alertPulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
              transform: [{ scale: alertPulse.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.2] }) }],
            }]} />
            <View style={styles.alertCore}><Ionicons name="notifications" size={32} color={colors.white} /></View>
          </View>
          <Text style={styles.alertHeroTitle}>SOS ACTIVE</Text>
          <Text style={styles.alertHeroTime}>{elapsed}</Text>
          <Text style={styles.alertHeroText}>Guardians are receiving your emergency status and live location.</Text>
        </View>

        <Card style={styles.liveCard}>
          <LiveRow icon="cloud-done-outline" title="SOS delivery" value="Incident created securely" ready={Boolean(activeState.incidentId)} />
          <View style={styles.liveDivider} />
          <LiveRow icon="navigate" title="Live location" value={activeState.locationStatus === 'sharing' ? 'Sharing with assigned guardians' : activeState.locationStatus === 'reconnecting' ? 'Reconnecting and queuing updates' : 'Location unavailable'} ready={activeState.locationStatus === 'sharing'} />
          <View style={styles.liveDivider} />
          <Animated.View style={{ opacity: acknowledgement, transform: [{ translateY: acknowledgement.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }] }}>
            <LiveRow icon="people" title="Guardian response" value={guardianStatusText} ready={activeState.guardianStatus === 'ready' || acknowledged > 0} />
          </Animated.View>
          <View style={styles.liveDivider} />
          <LiveRow icon="time-outline" title="Started" value={formatTime(activeState.startedAt)} />
        </Card>

        <EvidencePanel
          status={hardware.nativeDiagnostics.evidenceStatus}
          mode={hardware.nativeDiagnostics.evidenceMode}
          elapsed={elapsed}
          error={hardware.nativeDiagnostics.evidenceLastError}
          onStop={() => {
            void stopNativeEvidenceCapture().then(() => {
              showToast('Evidence recording stopped. Your SOS remains active.');
              return hardwareTriggerService.refreshNativeDiagnostics();
            });
          }}
        />

        {respondingNames.length > 0 ? <Text style={styles.mockFootnote}>{respondingNames.join(', ')} responding</Text> : null}
        <Text style={styles.mockFootnote}>Emergency services not contacted automatically. {connection !== 'connected' ? `Connection: ${connection}.` : ''}</Text>
        {activeState.issues.map((issue) => <Text key={issue} style={styles.issueText}>• {issue}</Text>)}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: detailsVisible }}
          onPress={() => setDetailsVisible((current) => !current)}
          style={({ pressed }) => [styles.detailsToggle, pressed && styles.detailsPressed]}>
          <View style={styles.detailsToggleIcon}><Ionicons name="list-outline" size={20} color={colors.navy} /></View>
          <Text style={styles.detailsToggleText}>{detailsVisible ? 'Hide incident details' : 'View incident details'}</Text>
          <Ionicons name={detailsVisible ? 'chevron-up' : 'chevron-down'} size={19} color={colors.textMuted} />
        </Pressable>

        {detailsVisible ? (
          <View style={styles.detailsContent}>
            <MapCard
              coordinates={location.coordinates}
              incidentCoordinates={activeState.incidentCoordinates}
              height={190}
              label="Current live location"
            />
            <Card>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>Technical details</Text>
                <StatusBadge label={activeState.isDemo ? 'Demo SOS' : 'Prototype SOS'} tone="danger" />
              </View>
              <DetailRow label="Incident coordinates" value={formatCoordinates(activeState.incidentCoordinates)} />
              <DetailRow label="Current coordinates" value={formatCoordinates(location.coordinates)} />
              <DetailRow label="Realtime connection" value={connection} />
              <DetailRow label="Incident record" value={activeState.incidentId ? 'Stored in Supabase' : 'Unavailable'} />
              <DetailRow label="SMS fallback" value={smsSent > 0 ? `${smsSent} accepted by provider` : 'Not sent or not configured'} />
              <DetailRow label="Guardian escalation" value={escalation ? escalation.status : 'Waiting for a response'} />
            </Card>
            <Card>
              <Text style={styles.cardTitle}>Response timeline</Text>
              <View style={styles.timelineSpacing}>
                <IncidentTimeline
                  active
                  items={[
                    'SOS activated',
                    'Incident location captured',
                    `${assignedCount} linked guardians assigned`,
                    activeState.locationStatus === 'sharing' ? 'Live location sharing active' : 'Location sharing needs attention',
                  ]}
                />
              </View>
            </Card>
            {activeState.isDemo && activeState.incidentId ? (
              <Button label="Open responder simulation" variant="secondary" icon="desktop-outline" onPress={() => router.push({ pathname: '/responder-simulation/[id]', params: { id: activeState.incidentId! } })} />
            ) : null}
            <Button label={`Call emergency services (${DEFAULT_EMERGENCY_NUMBER})`} variant="secondary" icon="call-outline" loading={callLoading} onPress={() => setCallVisible(true)} />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.activeFooter}>
        <Button
          label={activeState.stage === 'ending_failed' ? 'Retry cancelling SOS' : 'Cancel SOS — I am safe'}
          variant="danger"
          icon="shield-checkmark-outline"
          loading={ending || activeState.stage === 'ending'}
          disabled={activeState.stage === 'ending'}
          onPress={() => setEndVisible(true)}
        />
      </View>

      <ConfirmationModal
        visible={endVisible}
        title="Cancel and resolve this SOS?"
        message="Core Alert will stop live protection, securely finalize evidence, and keep the resolved incident in Activity."
        confirmLabel="Cancel SOS"
        onCancel={() => setEndVisible(false)}
        onConfirm={() => {
          setEndVisible(false);
          setEnding(true);
          void endSosTest().finally(() => setEnding(false));
        }}
      />
      <ConfirmationModal
        visible={callVisible}
        title={`Open the dialer with ${DEFAULT_EMERGENCY_NUMBER}?`}
        message="Core Alert will hand off to your phone dialer. You decide whether to place the call. Opening the dialer does not confirm that emergency services were contacted or dispatched."
        confirmLabel="Open dialer"
        onCancel={() => setCallVisible(false)}
        onConfirm={() => {
          setCallVisible(false);
          setCallLoading(true);
          void openEmergencyDialer(activeState.incidentId).catch((error) => {
            showToast(error instanceof Error ? error.message : 'The phone dialer could not be opened.');
          }).finally(() => setCallLoading(false));
        }}
      />
    </SafeAreaView>
  );
}

function EvidencePanel({ status, mode, elapsed, error, onStop }: {
  status: string;
  mode: string | null;
  elapsed: string;
  error: string;
  onStop: () => void;
}) {
  const recording = status === 'recording' || status === 'fallback';
  const label = recording
    ? mode === 'video' ? 'Video + audio recording' : 'Audio evidence recording'
    : status === 'starting' ? 'Starting evidence capture'
      : status === 'uploaded' ? 'Evidence secured'
        : status === 'permission_required' ? 'Permission required'
          : 'Evidence unavailable';
  return (
    <Card style={styles.evidenceCard}>
      <View style={styles.evidenceHeader}>
        <View style={[styles.recordingDot, !recording && styles.recordingDotIdle]} />
        <View style={styles.evidenceCopy}>
          <Text style={styles.evidenceEyebrow}>EMERGENCY EVIDENCE</Text>
          <Text style={styles.evidenceTitle}>{label}</Text>
        </View>
        <Text style={styles.evidenceTimer}>{recording ? elapsed : '—'}</Text>
      </View>
      <View style={styles.waveform} accessibilityLabel={recording ? 'Evidence recording active' : 'Evidence recording inactive'}>
        {[12, 24, 34, 20, 40, 28, 16, 32, 22, 38, 18, 26].map((height, index) => (
          <View key={`${height}-${index}`} style={[styles.waveBar, { height: recording ? height : 4 }]} />
        ))}
      </View>
      <View style={styles.evidenceMeta}>
        <Ionicons name={mode === 'video' ? 'videocam-outline' : 'mic-outline'} size={16} color={colors.blueBright} />
        <Text style={styles.evidenceText}>{error || 'Stored privately and uploaded securely after each finalized segment.'}</Text>
      </View>
      {recording ? <Button label="Stop evidence only" variant="secondary" icon="stop-circle-outline" onPress={onStop} style={styles.stopEvidenceButton} /> : null}
    </Card>
  );
}

function LiveRow({ icon, title, value, ready }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  value: string;
  ready?: boolean;
}) {
  return (
    <View style={styles.liveRow}>
      <View style={[styles.liveIcon, ready && styles.liveIconReady]}>
        <Ionicons name={icon} size={20} color={ready ? colors.green : colors.navy} />
      </View>
      <View style={styles.liveCopy}>
        <Text style={styles.liveTitle}>{title}</Text>
        <Text style={styles.liveValue}>{value}</Text>
      </View>
      <View style={[styles.liveStatusDot, ready && styles.liveStatusReady]} />
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  countdownScreen: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  demoBadge: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.redSoft,
    borderWidth: 1,
    borderColor: '#FECDCA',
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  demoBadgeText: { color: colors.redDark, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  countdownContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pulseArea: { width: 230, height: 230, alignItems: 'center', justifyContent: 'center' },
  outerRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: colors.red,
    backgroundColor: 'rgba(240,68,68,0.08)',
  },
  innerRing: {
    width: 164,
    height: 164,
    borderRadius: 82,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 9,
    borderColor: '#FFD6D6',
  },
  countdownNumber: { color: colors.white, fontSize: 68, lineHeight: 72, fontWeight: '800', fontVariant: ['tabular-nums'] },
  secondsLabel: { color: '#FFE8E8', fontSize: 13, fontWeight: '600' },
  countdownTitle: { color: colors.text, fontSize: 27, fontWeight: '800', marginTop: 18 },
  countdownMessage: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 330,
    marginTop: 8,
  },
  countdownFooter: { gap: 12 },
  demoNote: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  activeScreen: { flex: 1, backgroundColor: colors.background },
  activeContent: { padding: spacing.lg, gap: 14, paddingBottom: 116 },
  activeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 0 },
  liveDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.red, marginRight: 11 },
  activeHeaderCopy: { flex: 1 },
  activeEyebrow: { color: colors.redDark, fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  activeTitle: { color: colors.text, fontSize: 23, fontWeight: '800', marginTop: 2 },
  elapsed: { color: colors.redDark, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  alertHero: { minHeight: 218, alignItems: 'center', justifyContent: 'center', marginTop: -4 },
  alertEffect: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
  alertPulseRing: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: colors.red },
  alertCore: { zIndex: 1, width: 78, height: 78, borderRadius: 39, backgroundColor: colors.red, borderWidth: 7, borderColor: '#45141D', alignItems: 'center', justifyContent: 'center' },
  alertHeroTitle: { color: colors.redDark, fontSize: 21, fontWeight: '900', letterSpacing: 1.3, marginTop: 13 },
  alertHeroTime: { color: colors.text, fontSize: 29, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 2 },
  alertHeroText: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, textAlign: 'center', maxWidth: 290, marginTop: 5 },
  liveCard: { paddingVertical: 8 },
  liveRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center' },
  liveIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blueSoft },
  liveIconReady: { backgroundColor: colors.greenSoft },
  liveCopy: { flex: 1, marginLeft: 11 },
  liveTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  liveValue: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
  liveStatusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
  liveStatusReady: { backgroundColor: colors.green },
  liveDivider: { height: 1, backgroundColor: colors.border, marginLeft: 51 },
  mockFootnote: { color: colors.textMuted, fontSize: 11, textAlign: 'center' },
  evidenceCard: { borderColor: '#3A1A23' },
  evidenceHeader: { flexDirection: 'row', alignItems: 'center' },
  recordingDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.red, shadowColor: colors.red, shadowOpacity: 0.8, shadowRadius: 8, elevation: 7 },
  recordingDotIdle: { backgroundColor: colors.textMuted, shadowOpacity: 0 },
  evidenceCopy: { flex: 1, marginLeft: 10 },
  evidenceEyebrow: { color: colors.redDark, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  evidenceTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 2 },
  evidenceTimer: { color: colors.text, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  waveform: { height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 15, paddingHorizontal: 4 },
  waveBar: { width: 4, borderRadius: 2, backgroundColor: colors.red },
  evidenceMeta: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  evidenceText: { color: colors.textSecondary, fontSize: 10, lineHeight: 15, flex: 1 },
  stopEvidenceButton: { marginTop: 14, minHeight: 46 },
  issueText: { color: colors.amber, backgroundColor: colors.amberSoft, borderRadius: 10, padding: 10, fontSize: 11, lineHeight: 17 },
  detailsToggle: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, backgroundColor: colors.surface, borderRadius: radii.medium, borderWidth: 1, borderColor: colors.border },
  detailsPressed: { opacity: 0.7 },
  detailsToggleIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  detailsToggleText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700', marginLeft: 10 },
  detailsContent: { gap: 12 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  detailRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { color: colors.textSecondary, fontSize: 11 },
  detailValue: { color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: '600', marginTop: 4 },
  timelineSpacing: { marginTop: 14 },
  activeFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingTop: 12, backgroundColor: colors.backgroundSecondary, borderTopWidth: 1, borderTopColor: colors.border },
});
